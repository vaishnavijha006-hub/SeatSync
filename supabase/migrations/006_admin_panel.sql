-- ============================================
-- SeatSync - Phase 8: Admin Panel & RBAC Migration
-- Migration: 006_admin_panel.sql
-- ============================================

-- 1. PROFILES TABLE (User roles & Admin status)
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text,
    role text not null default 'user' check (role in ('user', 'admin')),
    created_at timestamptz not null default now()
);

-- Seed profiles for any existing users
insert into public.profiles (id, email, role)
select id, email, 'user'
from auth.users
on conflict (id) do nothing;

-- Automatic trigger to create a 'user' profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, role)
    values (new.id, new.email, 'user')
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- 2. HELPER FUNCTIONS: is_admin() & get_my_profile()
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(
        (select role = 'admin' from public.profiles where id = auth.uid()),
        false
    );
$$;

grant execute on function public.is_admin() to authenticated, anon;

create or replace function public.get_my_profile()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_role text;
    v_email text;
begin
    v_user_id := auth.uid();
    if v_user_id is null then
        return json_build_object('authenticated', false, 'role', null, 'is_admin', false);
    end if;

    select role, email into v_role, v_email
    from public.profiles
    where id = v_user_id;

    if not found then
        insert into public.profiles (id, email, role)
        values (v_user_id, (select email from auth.users where id = v_user_id), 'user')
        on conflict (id) do nothing;

        v_role := 'user';
    end if;

    return json_build_object(
        'authenticated', true,
        'user_id', v_user_id,
        'email', v_email,
        'role', coalesce(v_role, 'user'),
        'is_admin', (v_role = 'admin')
    );
end;
$$;

grant execute on function public.get_my_profile() to authenticated, anon;

-- 3. ROW LEVEL SECURITY ON PROFILES
alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
on public.profiles
for select
to authenticated
using (public.is_admin());

-- 4. RLS POLICIES FOR EVENTS (Admin Write)
drop policy if exists "Admins can insert events" on public.events;
create policy "Admins can insert events"
on public.events
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update events" on public.events;
create policy "Admins can update events"
on public.events
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete events" on public.events;
create policy "Admins can delete events"
on public.events
for delete
to authenticated
using (public.is_admin());

-- 5. RLS POLICIES FOR SHOWS (Admin Write)
drop policy if exists "Admins can insert shows" on public.shows;
create policy "Admins can insert shows"
on public.shows
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update shows" on public.shows;
create policy "Admins can update shows"
on public.shows
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete shows" on public.shows;
create policy "Admins can delete shows"
on public.shows
for delete
to authenticated
using (public.is_admin());

-- 6. RLS POLICIES FOR BOOKINGS & BOOKING SEATS (Admin Read)
drop policy if exists "Users can view own bookings" on public.bookings;
drop policy if exists "Users and admins can view bookings" on public.bookings;
create policy "Users and admins can view bookings"
on public.bookings
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can view own booking seats" on public.booking_seats;
drop policy if exists "Users and admins can view booking seats" on public.booking_seats;
create policy "Users and admins can view booking seats"
on public.booking_seats
for select
to authenticated
using (
    exists (
        select 1
        from public.bookings b
        where b.id = booking_id
        and (b.user_id = auth.uid() or public.is_admin())
    )
);

-- 7. ATOMIC SHOW CREATION WITH SEAT GENERATION RPC
create or replace function public.admin_create_show(
    p_event_id uuid,
    p_show_date date,
    p_show_time time,
    p_venue text,
    p_price numeric,
    p_row_labels text[],
    p_seats_per_row integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_show_id uuid;
    v_seat_count integer;
begin
    -- 1. Authorization check
    if not public.is_admin() then
        return json_build_object(
            'success', false,
            'message', 'Unauthorized: Admin role required'
        );
    end if;

    -- 2. Validation
    if p_event_id is null then
        return json_build_object('success', false, 'message', 'Event ID is required');
    end if;
    if p_show_date is null then
        return json_build_object('success', false, 'message', 'Show date is required');
    end if;
    if p_show_time is null then
        return json_build_object('success', false, 'message', 'Show time is required');
    end if;
    if p_venue is null or trim(p_venue) = '' then
        return json_build_object('success', false, 'message', 'Venue is required');
    end if;
    if p_price is null or p_price <= 0 then
        return json_build_object('success', false, 'message', 'Valid ticket price is required');
    end if;
    if p_row_labels is null or array_length(p_row_labels, 1) = 0 then
        return json_build_object('success', false, 'message', 'Row labels are required');
    end if;
    if p_seats_per_row is null or p_seats_per_row <= 0 then
        return json_build_object('success', false, 'message', 'Seats per row must be at least 1');
    end if;

    -- 3. Create show record
    insert into public.shows (
        event_id,
        show_date,
        show_time,
        venue,
        price,
        status
    ) values (
        p_event_id,
        p_show_date,
        p_show_time,
        p_venue,
        p_price,
        'active'
    )
    returning id into v_show_id;

    -- 4. Generate seats for this show
    insert into public.show_seats (show_id, row_label, seat_number, status)
    select
        v_show_id,
        trim(r),
        n,
        'available'
    from unnest(p_row_labels) as r
    cross join generate_series(1, p_seats_per_row) as n;

    get diagnostics v_seat_count = row_count;

    return json_build_object(
        'success', true,
        'show_id', v_show_id,
        'seat_count', v_seat_count,
        'message', 'Show and seat inventory created successfully'
    );
end;
$$;

grant execute on function public.admin_create_show(uuid, date, time, text, numeric, text[], integer) to authenticated;

-- 8. ATOMIC ADMIN BOOKING CANCELLATION RPC
create or replace function public.admin_cancel_booking(
    p_booking_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_booking_id uuid;
    v_current_status text;
    v_released_count integer;
begin
    -- 1. Authorization check
    if not public.is_admin() then
        return json_build_object(
            'success', false,
            'message', 'Unauthorized: Admin role required'
        );
    end if;

    -- 2. Validate input
    if p_booking_id is null then
        return json_build_object('success', false, 'message', 'Booking ID is required');
    end if;

    -- 3. Verify booking exists
    select id, status into v_booking_id, v_current_status
    from public.bookings
    where id = p_booking_id;

    if not found then
        return json_build_object('success', false, 'message', 'Booking not found');
    end if;

    if v_current_status = 'cancelled' then
        return json_build_object('success', false, 'message', 'Booking is already cancelled');
    end if;

    -- 4. Transition booking status to 'cancelled'
    update public.bookings
    set status = 'cancelled'
    where id = p_booking_id;

    -- 5. Release seats back to available
    update public.show_seats
    set
        status = 'available',
        locked_by = null,
        locked_until = null
    where id in (
        select coalesce(show_seat_id, seat_id)
        from public.booking_seats
        where booking_id = p_booking_id
    );

    get diagnostics v_released_count = row_count;

    return json_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'released_seats', v_released_count,
        'message', 'Booking successfully cancelled and seats released'
    );
end;
$$;

grant execute on function public.admin_cancel_booking(uuid) to authenticated;

-- 9. ACTIVE LOCK MONITOR RPC
create or replace function public.admin_get_active_locks()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_result json;
begin
    -- Authorization check
    if not public.is_admin() then
        return json_build_object('success', false, 'message', 'Unauthorized: Admin role required');
    end if;

    select json_agg(
        json_build_object(
            'seat_id', ss.id,
            'seat_label', ss.row_label || ss.seat_number::text,
            'status', ss.status,
            'locked_by', ss.locked_by,
            'locked_until', ss.locked_until,
            'show_id', s.id,
            'show_date', s.show_date,
            'show_time', s.show_time,
            'venue', s.venue,
            'event_name', e.name
        )
    )
    into v_result
    from public.show_seats ss
    join public.shows s on s.id = ss.show_id
    join public.events e on e.id = s.event_id
    where ss.status = 'held'
      and ss.locked_until > now();

    return coalesce(v_result, '[]'::json);
end;
$$;

grant execute on function public.admin_get_active_locks() to authenticated;
