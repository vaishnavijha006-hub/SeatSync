# SeatSync
Live URL = https://seat-sync.netlify.app/
SeatSync is a realtime, high-concurrency seat reservation and booking system built with React, Vite, and Supabase.

## Booking Architecture & Show-Based Inventory

The booking lifecycle follows a strict hierarchy:

```
Event / Movie
     ↓
Show (Date, Time, Venue, Price)
     ↓
Show-Specific Seat Inventory
     ↓
Temporary Hold (5-minute atomic lock)
     ↓
Simulated Payment (Success / Failure / Cancel)
     ↓
Confirmed Booking
```

### Why Seats Are Show-Specific

A movie or live event can have multiple screenings across dates and show times. A seat (e.g., **A1**) booked for a 10:00 AM show must remain completely available for the 2:00 PM and 6:00 PM shows.

Therefore, seat inventory is tied directly to the **show (`show_seats`)**, rather than the top-level event. Each show maintains its own independent seat layout, availability state, and lock timestamps.

---

## Database Architecture & RPCs

### 1. New & Modified Tables (`004_show_based_booking.sql`)

- **`shows`**:
  - `id` (UUID, Primary Key)
  - `event_id` (UUID references `events(id)`)
  - `show_date` (DATE)
  - `show_time` (TIME)
  - `venue` (TEXT)
  - `price` (NUMERIC)
  - `status` (`active` | `cancelled`)
  - Unique constraint on `(event_id, show_date, show_time)` prevents duplicate shows.

- **`show_seats`**:
  - `id` (UUID, Primary Key)
  - `show_id` (UUID references `shows(id)`)
  - `row_label` (TEXT)
  - `seat_number` (INTEGER)
  - `status` (`available` | `held` | `booked`)
  - `locked_by` (UUID references `auth.users(id)`)
  - `locked_until` (TIMESTAMPTZ)
  - Unique constraint on `(show_id, row_label, seat_number)` ensures unique seat coordinates per show.

- **`bookings`**:
  - Added `show_id` (UUID references `shows(id)`).

- **`booking_seats`**:
  - Added `show_seat_id` (UUID references `show_seats(id)`).
  - Dropped rigid foreign key on legacy `seats` table to connect booking items to show-specific seats.

### 2. Show-Scoped Atomic RPCs

All seat mutation logic is executed inside atomic PostgreSQL functions:

1. **`lock_seats(p_show_id uuid, p_seat_ids uuid[])`**:
   - Acquires temporary 5-minute holds on available seats or reclaims expired holds atomically.
   - If any requested seat is unavailable, rolls back any seats locked during that call.

2. **`confirm_booking(p_show_id uuid, p_seat_ids uuid[])`**:
   - Uses `FOR UPDATE` row-level locking to verify all requested seats are held by the calling user and unexpired (`locked_until > now()`).
   - Retrieves the show's price to calculate total amount.
   - Inserts booking into `bookings` and creates associated `booking_seats`.
   - Transitions `show_seats` status to `booked` and clears lock fields.

3. **`release_held_seats(p_show_id uuid, p_seat_ids uuid[])`**:
   - Releases only the seats held by `auth.uid()` for the designated show back to `available`.

### 3. Realtime Updates

Supabase Realtime listens to postgres changes on `public.show_seats` filtered by `show_id=eq.<selected_show_id>`. Whenever seats are held, released, or booked by any user, all connected clients viewing that specific show see immediate updates without page reload.

---

## Simulated Payment

- **Simulated Payment Flow**: The checkout and payment process is simulated for testing and demonstration purposes without requiring a third-party payment gateway (such as Stripe or Razorpay).
- **Successful Payment**: Invokes the atomic `confirm_booking` PostgreSQL RPC with the active `show_id`.
- **Failed or Cancelled Payment**: Invokes the secure `release_held_seats` PostgreSQL RPC, which immediately returns the user's held seats to `available`.
- **Expired Hold Enforcement**: Expired seat holds cannot be confirmed. Both client-side validation and backend row-level locking (`locked_until > now()`) reject confirmations for expired holds.
- **Database Authority**: PostgreSQL remains the single source of truth for seat inventory and concurrency control.

---

## My Bookings / Booking History

- **User-Scoped Security**: Bookings are fetched directly from PostgreSQL using Supabase Row Level Security (RLS) with the policy `auth.uid() = user_id`. Logged-out users have no access, and authenticated users (both registered email users and anonymous guests) can only access their own booking records.
- **Relational Integrity**: Queries leverage PostgREST relational joins to pull the related `events`, `shows` (date, time, venue, price), and `booking_seats` (mapped to `show_seats` row and seat number).
- **Session Continuity**: Booking history is immediately updated upon successful payment confirmation and remains persistent across page reloads and browser sessions.
- **Expandable Receipts**: Users can view high-level summaries (event, date, time, venue, seats, total) or toggle detailed receipts displaying booking UUIDs, timestamps, and venue breakdowns.

---

## Admin Panel & Role-Based Access Control (RBAC)

### 1. Database-Enforced Authorization (`006_admin_panel.sql`)
- **`profiles` Table**: Maps `auth.users(id)` to roles (`'user'` or `'admin'`). RLS restricts role modifications so normal users cannot escalate their privileges.
- **`public.is_admin()` Function**: A `SECURITY DEFINER` function that checks whether `auth.uid()` has `role = 'admin'`. Used across all admin RLS policies and RPCs.
- **Assigning the First Admin**: Run in the Supabase SQL Editor:
  ```sql
  UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@example.com';
  ```

### 2. Admin Privileges & Capabilities
- **Event Management**: Create new events and movies with custom venues and schedules.
- **Show Schedules & Inventory Generation**: Create shows with date, time, venue, and price, with configurable rows (e.g. `A, B, C, D, E`) and seats per row (e.g. `5`). Atomic generation of all `show_seats` rows.
- **Cross-User Booking Inspection**: Inspect all bookings made across the entire platform.
- **Atomic Booking Cancellation**: Cancel confirmed bookings via `admin_cancel_booking` RPC. The booking status transitions to `cancelled`, and all associated `show_seats` are automatically released back to `available` with cleared lock timestamps.
- **Active Seat Lock Monitor**: Inspect temporary holds in real time with countdowns, automatically excluding expired holds.
