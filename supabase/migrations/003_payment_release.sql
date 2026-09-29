-- ============================================
-- SeatSync - Seat Hold Release Migration
-- Migration: 003_payment_release.sql
-- ============================================

-- ============================================
-- ATOMIC RELEASE HELD SEATS RPC
-- ============================================

create or replace function public.release_held_seats(
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
    v_released_count integer;
begin

    -- 1. Validate authentication
    v_user_id := auth.uid();

    if v_user_id is null then
        return json_build_object(
            'success', false,
            'message', 'User is not authenticated'
        );
    end if;

    -- 2. Validate input parameters
    if p_event_id is null then
        return json_build_object(
            'success', false,
            'message', 'Event ID is required'
        );
    end if;

    if p_seat_ids is null or array_length(p_seat_ids, 1) = 0 then
        return json_build_object(
            'success', false,
            'message', 'No seats selected to release'
        );
    end if;

    -- 3. Release only seats held by the authenticated user for the given event
    update public.seats
    set
        status = 'available',
        locked_by = null,
        locked_until = null
    where id = any(p_seat_ids)
      and event_id = p_event_id
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

-- Grant execution permissions
grant execute on function public.release_held_seats(uuid, uuid[]) to authenticated, anon;
