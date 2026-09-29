-- ============================================
-- SeatSync - Phase 9: Security Hardening
-- Migration: 007_security_hardening.sql
-- ============================================
-- Applies explicit DENY-by-default hardening for
-- tables that had no write policies (correct behavior
-- already enforced, but now explicitly documented
-- and hardened with REVOKE + explicit DENY notes).
-- Also tightens RPC grants and adds missing policies.
-- ============================================

-- ────────────────────────────────────────────────────
-- 1. EXPLICITLY DENY DIRECT WRITES ON show_seats
-- ────────────────────────────────────────────────────
-- show_seats already has no UPDATE/INSERT/DELETE policy,
-- which means RLS silently blocks writes (returns 204, 0
-- rows affected). We add a named DENY-by-design comment
-- and explicitly ensure no unintended policies exist.

-- Drop any accidental write policies that may have been added
drop policy if exists "Users can update show_seats" on public.show_seats;
drop policy if exists "Authenticated can update show_seats" on public.show_seats;
drop policy if exists "Anyone can update show_seats" on public.show_seats;

-- ────────────────────────────────────────────────────
-- 2. EXPLICITLY DENY DIRECT WRITES ON bookings
-- ────────────────────────────────────────────────────
-- bookings already has no INSERT/UPDATE/DELETE policy.
-- Confirm_booking RPC (SECURITY DEFINER) is the only
-- authorized write path. Drop any accidental policies.
drop policy if exists "Users can insert bookings" on public.bookings;
drop policy if exists "Users can update bookings" on public.bookings;
drop policy if exists "Users can delete bookings" on public.bookings;

-- ────────────────────────────────────────────────────
-- 3. REVOKE anon GRANT ON lock_seats (tighten grants)
-- ────────────────────────────────────────────────────
-- lock_seats, confirm_booking, and release_held_seats
-- were granted to both 'authenticated' and 'anon'.
-- The RPC always checks auth.uid() != null, so the anon
-- grant is harmless, but we tighten it for clarity.
-- NOTE: In Supabase, anonymous signIn users receive
-- the 'authenticated' role, not 'anon'. The 'anon'
-- grant only affects truly unauthenticated API calls,
-- which are blocked by the auth.uid() null check anyway.

revoke execute on function public.lock_seats(uuid, uuid[]) from anon;
revoke execute on function public.confirm_booking(uuid, uuid[]) from anon;
revoke execute on function public.release_held_seats(uuid, uuid[]) from anon;

-- Re-grant to authenticated only (anonymous signIn users use this role)
grant execute on function public.lock_seats(uuid, uuid[]) to authenticated;
grant execute on function public.confirm_booking(uuid, uuid[]) to authenticated;
grant execute on function public.release_held_seats(uuid, uuid[]) to authenticated;

-- ────────────────────────────────────────────────────
-- 4. TIGHTEN is_admin() GRANT
-- ────────────────────────────────────────────────────
-- is_admin() was granted to both authenticated and anon.
-- Revoke from anon — only authenticated users need it.
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

-- ────────────────────────────────────────────────────
-- 5. TIGHTEN get_my_profile() GRANT
-- ────────────────────────────────────────────────────
-- get_my_profile() was granted to authenticated and anon.
-- Keep anon so unauthenticated callers get authenticated:false
-- (this is the intended UX behavior — no change needed here).
-- Already correctly returns {authenticated: false} for anon.

-- ────────────────────────────────────────────────────
-- 6. ADD EXPLICIT UPDATE BLOCK NOTE on profiles
-- ────────────────────────────────────────────────────
-- profiles has no UPDATE policy — users cannot change
-- their own role. Role changes must go through SQL Editor.
-- This is intentional. Drop any accidental policies.
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Authenticated can update profiles" on public.profiles;

-- ────────────────────────────────────────────────────
-- 7. ADD booking_seats EXPLICIT DELETE BLOCK
-- ────────────────────────────────────────────────────
-- booking_seats has no DELETE policy. The only authorized
-- delete path is cascade from bookings (via admin_cancel_booking).
drop policy if exists "Users can delete booking_seats" on public.booking_seats;

-- ────────────────────────────────────────────────────
-- 8. ADD EXPLICIT INDEX FOR PERFORMANCE + SECURITY
-- ────────────────────────────────────────────────────
-- Ensure the locked_by + locked_until compound index exists
-- for efficient lock expiry queries used in lock_seats.
create index if not exists idx_show_seats_lock
    on public.show_seats (show_id, status, locked_until)
    where status = 'held';

-- ────────────────────────────────────────────────────
-- 9. ADD SHOWS DELETE GUARD
-- ────────────────────────────────────────────────────
-- Ensure non-admins cannot delete shows via direct DELETE
-- (already blocked by RLS, but add clarity).
drop policy if exists "Users can delete shows" on public.shows;

-- ────────────────────────────────────────────────────
-- 10. SECURITY COMMENT DOCUMENTATION
-- ────────────────────────────────────────────────────
comment on function public.lock_seats(uuid, uuid[]) is
    'SECURITY DEFINER. Atomically holds show seats for authenticated users. Rollback on partial lock. Checks: auth.uid() not null, show_id not null, seat count > 0, seat belongs to show.';

comment on function public.confirm_booking(uuid, uuid[]) is
    'SECURITY DEFINER. Atomically confirms booking if all seats are held by the calling user with valid lock_until. Uses CTE FOR UPDATE to prevent double-confirm. Price fetched from shows table server-side — no client price input accepted.';

comment on function public.release_held_seats(uuid, uuid[]) is
    'SECURITY DEFINER. Releases seats held by the calling user only. WHERE locked_by = auth.uid() prevents cross-user release.';

comment on function public.admin_create_show(uuid, date, time, text, numeric, text[], integer) is
    'SECURITY DEFINER. Creates a show and seat inventory. Checks is_admin() first. Admin-only.';

comment on function public.admin_cancel_booking(uuid) is
    'SECURITY DEFINER. Cancels a booking and releases show_seats back to available. Checks is_admin() first. Admin-only.';

comment on function public.admin_get_active_locks() is
    'SECURITY DEFINER. Returns currently held seats with show/event info. Checks is_admin() first. Admin-only.';
