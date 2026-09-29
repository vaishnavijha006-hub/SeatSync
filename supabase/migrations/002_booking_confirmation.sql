-- ============================================
-- SeatSync - Atomic Booking Confirmation Migration
-- Migration: 002_booking_confirmation.sql
-- ============================================

-- ============================================
-- ATOMIC BOOKING CONFIRMATION RPC
-- ============================================

create or replace function public.confirm_booking(
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
    v_required_count integer;
    v_locked_count integer;
    v_total_amount numeric(10,2);
    v_booking_id uuid;
    v_seat_id uuid;
begin

    -- A. Validate authentication
    v_user_id := auth.uid();

    if v_user_id is null then
        return json_build_object(
            'success', false,
            'message', 'User is not authenticated'
        );
    end if;

    -- B. Validate input
    if p_event_id is null then
        return json_build_object(
            'success', false,
            'message', 'Event ID is required'
        );
    end if;

    v_required_count := array_length(p_seat_ids, 1);

    if v_required_count is null or v_required_count = 0 then
        return json_build_object(
            'success', false,
            'message', 'No seats selected for confirmation'
        );
    end if;

    -- C. Lock/check all requested seats using row locking (FOR UPDATE)
    -- All seats must:
    -- - belong to p_event_id
    -- - have status = 'held'
    -- - have locked_by = auth.uid()
    -- - have locked_until > now()
    select count(*)
    into v_locked_count
    from public.seats
    where id = any(p_seat_ids)
      and event_id = p_event_id
      and status = 'held'
      and locked_by = v_user_id
      and locked_until > now()
    for update;

    -- D. If ANY requested seat fails validation:
    -- Do NOT create a booking. Do NOT modify any seats.
    if v_locked_count <> v_required_count then
        return json_build_object(
            'success', false,
            'message', 'One or more seats are no longer on hold or have expired'
        );
    end if;

    -- E. If all seats are valid:
    -- 1. Create one row in bookings:
    --    user_id = auth.uid()
    --    event_id = p_event_id
    --    total_amount = number_of_seats * 200
    --    status = 'confirmed'
    v_total_amount := v_required_count * 200.00;

    insert into public.bookings (
        user_id,
        event_id,
        total_amount,
        status
    ) values (
        v_user_id,
        p_event_id,
        v_total_amount,
        'confirmed'
    )
    returning id into v_booking_id;

    -- 2. Insert one row into booking_seats for every selected seat
    foreach v_seat_id in array p_seat_ids loop
        insert into public.booking_seats (
            booking_id,
            seat_id
        ) values (
            v_booking_id,
            v_seat_id
        );
    end loop;

    -- 3. Update all selected seats:
    --    status = 'booked'
    --    locked_by = NULL
    --    locked_until = NULL
    update public.seats
    set
        status = 'booked',
        locked_by = null,
        locked_until = null
    where id = any(p_seat_ids)
      and event_id = p_event_id;

    -- 4. Return summary payload
    return json_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'total_amount', v_total_amount,
        'seat_count', v_required_count,
        'message', 'Booking confirmed successfully'
    );

end;
$$;

-- Grant execution permissions
grant execute on function public.confirm_booking(uuid, uuid[]) to authenticated, anon;
