-- ============================================
-- SeatSync - Initial Database Schema
-- ============================================

-- EVENTS
create table public.events (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    venue text not null,
    event_time timestamptz not null,
    created_at timestamptz not null default now()
);


-- SEATS
create table public.seats (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,

    row_label text not null,
    seat_number integer not null,

    status text not null default 'available'
        check (status in ('available', 'held', 'booked')),

    locked_by uuid references auth.users(id),
    locked_until timestamptz,

    created_at timestamptz not null default now(),

    unique(event_id, row_label, seat_number)
);


-- BOOKINGS
create table public.bookings (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null references auth.users(id),
    event_id uuid not null references public.events(id),

    total_amount numeric(10,2) not null default 0,

    status text not null default 'confirmed'
        check (status in ('confirmed', 'cancelled')),

    created_at timestamptz not null default now()
);


-- BOOKING SEATS
create table public.booking_seats (
    id uuid primary key default gen_random_uuid(),

    booking_id uuid not null
        references public.bookings(id) on delete cascade,

    seat_id uuid not null
        references public.seats(id),

    unique(booking_id, seat_id)
);


-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.events enable row level security;
alter table public.seats enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_seats enable row level security;


-- ============================================
-- RLS POLICIES
-- ============================================

create policy "Anyone can view events"
on public.events
for select
to anon, authenticated
using (true);


create policy "Anyone can view seats"
on public.seats
for select
to anon, authenticated
using (true);


create policy "Users can view own bookings"
on public.bookings
for select
to authenticated
using (auth.uid() = user_id);


create policy "Users can view own booking seats"
on public.booking_seats
for select
to authenticated
using (
    exists (
        select 1
        from public.bookings b
        where b.id = booking_id
        and b.user_id = auth.uid()
    )
);


-- ============================================
-- ATOMIC SEAT LOCKING
-- ============================================

create or replace function public.lock_seats(
    p_event_id uuid,
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
begin

    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'User is not authenticated';
    end if;

    v_required_count := array_length(p_seat_ids, 1);

    if v_required_count is null or v_required_count = 0 then
        raise exception 'No seats selected';
    end if;

    update public.seats
    set
        status = 'held',
        locked_by = v_user_id,
        locked_until = now() + interval '5 minutes'
    where id = any(p_seat_ids)
      and event_id = p_event_id
      and (
          status = 'available'
          or (
              status = 'held'
              and locked_until < now()
          )
      );

    get diagnostics v_locked_count = row_count;

    if v_locked_count <> v_required_count then

        update public.seats
        set
            status = 'available',
            locked_by = null,
            locked_until = null
        where id = any(p_seat_ids)
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


-- ============================================
-- REALTIME
-- ============================================

alter publication supabase_realtime
add table public.seats;