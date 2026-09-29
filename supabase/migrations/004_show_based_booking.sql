-- ============================================
-- SeatSync - Phase 6: Show-Based Booking Migration
-- Migration: 004_show_based_booking.sql
-- ============================================

-- 1. SHOWS TABLE
create table if not exists public.shows (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    show_date date not null,
    show_time time not null,
    venue text not null,
    price numeric(10,2) not null default 200.00,
    status text not null default 'active'
        check (status in ('active', 'cancelled')),
    created_at timestamptz not null default now(),

    unique(event_id, show_date, show_time)
);

create index if not exists idx_shows_event on public.shows(event_id);
create index if not exists idx_shows_date on public.shows(show_date);

-- 2. SHOW_SEATS TABLE (Show-specific seat inventory)
create table if not exists public.show_seats (
    id uuid primary key default gen_random_uuid(),
    show_id uuid not null references public.shows(id) on delete cascade,
    row_label text not null,
    seat_number integer not null,
    status text not null default 'available'
        check (status in ('available', 'held', 'booked')),
    locked_by uuid references auth.users(id),
    locked_until timestamptz,
    created_at timestamptz not null default now(),

    unique(show_id, row_label, seat_number)
);

create index if not exists idx_show_seats_show_id on public.show_seats(show_id);
create index if not exists idx_show_seats_status on public.show_seats(status);

-- 3. UPDATE BOOKINGS TABLE
-- Add show_id column and allow event_id to be populated or optional
alter table public.bookings
    add column if not exists show_id uuid references public.shows(id);

create index if not exists idx_bookings_show_id on public.bookings(show_id);

-- 4. UPDATE BOOKING_SEATS TABLE
-- Drop foreign key constraint on public.seats if exists so seat_id or show_seat_id can reference show_seats
alter table public.booking_seats
    drop constraint if exists booking_seats_seat_id_fkey;

alter table public.booking_seats
    alter column seat_id drop not null;

alter table public.booking_seats
    add column if not exists show_seat_id uuid references public.show_seats(id);

-- 5. ROW LEVEL SECURITY
alter table public.shows enable row level security;
alter table public.show_seats enable row level security;

-- Drop prior policies if they exist before recreating
drop policy if exists "Anyone can view shows" on public.shows;
create policy "Anyone can view shows"
on public.shows
for select
to anon, authenticated
using (true);

drop policy if exists "Anyone can view show seats" on public.show_seats;
create policy "Anyone can view show seats"
on public.show_seats
for select
to anon, authenticated
using (true);

-- 6. REALTIME SUBSCRIPTION
do $$
begin
    alter publication supabase_realtime add table public.show_seats;
exception
    when duplicate_object then null;
end $$;

-- 7. ATOMIC SHOW-BASED SEAT LOCKING RPC
create or replace function public.lock_seats(
    p_show_id uuid,
    p_seat_ids uuid[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_locked_count integer;
    v_required_count integer;
    v_booking_expiry timestamptz;
    v_newly_locked_ids uuid[];
begin
    -- Authenticated user validation
    v_user_id := auth.uid();
    if v_user_id is null then
        return json_build_object(
            'success', false,
            'message', 'User is not authenticated'
        );
    end if;

    if p_show_id is null then
        return json_build_object(
            'success', false,
            'message', 'Show ID is required'
        );
    end if;

    v_required_count := array_length(p_seat_ids, 1);
    if v_required_count is null or v_required_count = 0 then
        return json_build_object(
            'success', false,
            'message', 'No seats selected'
        );
    end if;

    -- Lock available seats or reclaim expired holds atomically
    with acquired as (
        update public.show_seats
        set
            status = 'held',
            locked_by = v_user_id,
            locked_until = now() + interval '5 minutes'
        where id = any(p_seat_ids)
          and show_id = p_show_id
          and (
              status = 'available'
              or (
                  status = 'held'
                  and locked_until < now()
              )
          )
        returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[])
    into v_newly_locked_ids
    from acquired;

    v_locked_count := cardinality(v_newly_locked_ids);

    -- If unable to acquire all requested seats, release any locked in this request
    if v_locked_count <> v_required_count then
        update public.show_seats
        set
            status = 'available',
            locked_by = null,
            locked_until = null
        where id = any(v_newly_locked_ids)
          and show_id = p_show_id
          and locked_by = v_user_id
          and status = 'held';

        return json_build_object(
            'success', false,
            'message', 'One or more seats are already unavailable'
        );
    end if;

    v_booking_expiry := now() + interval '5 minutes';

    return json_build_object(
        'success', true,
        'message', 'Seats locked successfully',
        'locked_until', v_booking_expiry
    );
end;
$$;

grant execute on function public.lock_seats(uuid, uuid[]) to authenticated, anon;

-- 8. ATOMIC SHOW-BASED BOOKING CONFIRMATION RPC
create or replace function public.confirm_booking(
    p_show_id uuid,
    p_seat_ids uuid[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_required_count integer;
    v_locked_count integer;
    v_total_amount numeric(10,2);
    v_booking_id uuid;
    v_seat_id uuid;
    v_event_id uuid;
    v_show_price numeric(10,2);
begin
    -- 1. Validate authentication
    v_user_id := auth.uid();
    if v_user_id is null then
        return json_build_object(
            'success', false,
            'message', 'User is not authenticated'
        );
    end if;

    -- 2. Validate input
    if p_show_id is null then
        return json_build_object(
            'success', false,
            'message', 'Show ID is required'
        );
    end if;

    v_required_count := array_length(p_seat_ids, 1);
    if v_required_count is null or v_required_count = 0 then
        return json_build_object(
            'success', false,
            'message', 'No seats selected for confirmation'
        );
    end if;

    -- 3. Fetch show details and price
    select event_id, price into v_event_id, v_show_price
    from public.shows
    where id = p_show_id and status = 'active';

    if not found then
        return json_build_object(
            'success', false,
            'message', 'Show not found or inactive'
        );
    end if;

    -- 4. Check and lock all requested seats using row locking (FOR UPDATE)
    with locked as (
        select id
        from public.show_seats
        where id = any(p_seat_ids)
          and show_id = p_show_id
          and status = 'held'
          and locked_by = v_user_id
          and locked_until > now()
        for update
    )
    select count(*) into v_locked_count from locked;

    if v_locked_count <> v_required_count then
        return json_build_object(
            'success', false,
            'message', 'One or more seats are no longer on hold or have expired'
        );
    end if;

    -- 5. Calculate total amount
    v_total_amount := v_required_count * coalesce(v_show_price, 200.00);

    -- 6. Insert booking record
    insert into public.bookings (
        user_id,
        event_id,
        show_id,
        total_amount,
        status
    ) values (
        v_user_id,
        v_event_id,
        p_show_id,
        v_total_amount,
        'confirmed'
    )
    returning id into v_booking_id;

    -- 7. Insert booking seats records
    foreach v_seat_id in array p_seat_ids loop
        insert into public.booking_seats (
            booking_id,
            seat_id,
            show_seat_id
        ) values (
            v_booking_id,
            v_seat_id,
            v_seat_id
        );
    end loop;

    -- 8. Mark show_seats as booked
    update public.show_seats
    set
        status = 'booked',
        locked_by = null,
        locked_until = null
    where id = any(p_seat_ids)
      and show_id = p_show_id;

    -- 9. Return confirmation summary
    return json_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'total_amount', v_total_amount,
        'seat_count', v_required_count,
        'message', 'Booking confirmed successfully'
    );
end;
$$;

grant execute on function public.confirm_booking(uuid, uuid[]) to authenticated, anon;

-- 9. ATOMIC SHOW-BASED SEAT RELEASE RPC
create or replace function public.release_held_seats(
    p_show_id uuid,
    p_seat_ids uuid[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_released_count integer;
begin
    -- 1. Validate auth
    v_user_id := auth.uid();
    if v_user_id is null then
        return json_build_object(
            'success', false,
            'message', 'User is not authenticated'
        );
    end if;

    -- 2. Validate input
    if p_show_id is null then
        return json_build_object(
            'success', false,
            'message', 'Show ID is required'
        );
    end if;

    if p_seat_ids is null or array_length(p_seat_ids, 1) = 0 then
        return json_build_object(
            'success', false,
            'message', 'No seats selected to release'
        );
    end if;

    -- 3. Release only seats held by the authenticated user for the given show
    update public.show_seats
    set
        status = 'available',
        locked_by = null,
        locked_until = null
    where id = any(p_seat_ids)
      and show_id = p_show_id
      and status = 'held'
      and locked_by = v_user_id;

    get diagnostics v_released_count = row_count;

    return json_build_object(
        'success', true,
        'released_count', v_released_count,
        'message', 'Seats released successfully'
    );
end;
$$;

grant execute on function public.release_held_seats(uuid, uuid[]) to authenticated, anon;

-- 10. DEMO DATA SEEDING
-- Preserve demo event: SeatSync Demo Show (id: 2d3a3aa8-7b36-4216-986a-9b5086e72fb2)
insert into public.events (id, name, venue, event_time)
values (
    '2d3a3aa8-7b36-4216-986a-9b5086e72fb2',
    'SeatSync Demo Show',
    'Main Auditorium',
    '2026-10-01 18:00:00+05:30'
)
on conflict (id) do nothing;

-- Create 3 demo shows for 2026-10-01
insert into public.shows (id, event_id, show_date, show_time, venue, price, status)
values
    (
        'a1111111-1111-1111-1111-111111111111',
        '2d3a3aa8-7b36-4216-986a-9b5086e72fb2',
        '2026-10-01',
        '10:00:00',
        'Main Auditorium',
        200.00,
        'active'
    ),
    (
        'a2222222-2222-2222-2222-222222222222',
        '2d3a3aa8-7b36-4216-986a-9b5086e72fb2',
        '2026-10-01',
        '14:00:00',
        'Main Auditorium',
        200.00,
        'active'
    ),
    (
        'a3333333-3333-3333-3333-333333333333',
        '2d3a3aa8-7b36-4216-986a-9b5086e72fb2',
        '2026-10-01',
        '18:00:00',
        'Main Auditorium',
        200.00,
        'active'
    )
on conflict (event_id, show_date, show_time) do nothing;

-- Create 25 seats (A1-A5, B1-B5, C1-C5, D1-D5, E1-E5) for EACH show
insert into public.show_seats (show_id, row_label, seat_number, status)
select
    s.id,
    r.row_label,
    n.seat_number,
    'available'
from public.shows s
cross join (values ('A'), ('B'), ('C'), ('D'), ('E')) as r(row_label)
cross join (values (1), (2), (3), (4), (5)) as n(seat_number)
where s.id in (
    'a1111111-1111-1111-1111-111111111111',
    'a2222222-2222-2222-2222-222222222222',
    'a3333333-3333-3333-3333-333333333333'
)
on conflict (show_id, row_label, seat_number) do nothing;
