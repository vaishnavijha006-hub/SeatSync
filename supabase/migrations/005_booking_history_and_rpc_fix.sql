-- ============================================
-- SeatSync - Phase 7: Booking History & Confirmation RPC Fix
-- Migration: 005_booking_history_and_rpc_fix.sql
-- ============================================

-- 1. ATOMIC SHOW-BASED BOOKING CONFIRMATION RPC (FIXED ROW LOCKING)
-- Uses CTE with FOR UPDATE to prevent 'FOR UPDATE is not allowed with aggregate functions'
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
    v_confirmation_time timestamptz;
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

    -- 4. Lock all requested seats before checking hold expiry.
    with locked as (
        select id
        from public.show_seats
        where id = any(p_seat_ids)
          and show_id = p_show_id
          and status = 'held'
          and locked_by = v_user_id
        for update
    )
    select count(*) into v_locked_count from locked;

    if v_locked_count <> v_required_count then
        return json_build_object(
            'success', false,
            'message', 'One or more seats are no longer on hold or have expired'
        );
    end if;

    -- Evaluate expiry against wall-clock time only after all seat locks are acquired.
    v_confirmation_time := clock_timestamp();
    select count(*)
    into v_locked_count
    from public.show_seats
    where id = any(p_seat_ids)
      and show_id = p_show_id
      and status = 'held'
      and locked_by = v_user_id
      and locked_until > v_confirmation_time;

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
