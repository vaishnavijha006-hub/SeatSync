import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from './lib/supabase'
import SeatMap from './components/SeatMap'
import BookingSummary from './components/BookingSummary'
import { useSeatsRealtime } from './hooks/useSeatsRealtime'
import { useHoldTimer } from './hooks/useHoldTimer'
import './App.css'

const EVENT_ID = '2d3a3aa8-7b36-4216-986a-9b5086e72fb2'
const PRICE_PER_SEAT = 200

function App() {
  const [user, setUser] = useState(null)
  const [event, setEvent] = useState(null)
  const [seats, setSeats] = useState([])
  const [selectedSeatIds, setSelectedSeatIds] = useState(() => new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isHolding, setIsHolding] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmedBooking, setConfirmedBooking] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  // Ticker to normalize expired holds across all users every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch all seats for the active event
  const fetchSeats = useCallback(async () => {
    const { data, error } = await supabase
      .from('seats')
      .select('*')
      .eq('event_id', EVENT_ID)
      .order('row_label', { ascending: true })
      .order('seat_number', { ascending: true })

    if (error) {
      console.error('Error fetching seats:', error)
      setErrorMessage(`Failed to load seats: ${error.message}`)
      return
    }

    setSeats(data || [])
  }, [])

  // Fetch event details
  const fetchEvent = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', EVENT_ID)
      .single()

    if (error) {
      console.error('Error fetching event:', error)
      setErrorMessage(`Failed to load event details: ${error.message}`)
      return
    }

    setEvent(data)
  }, [])

  // Initialize or restore anonymous session
  const initAuth = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session?.user) {
      setUser(session.user)
      return session.user
    }

    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) {
      console.error('Auth error:', error)
      setErrorMessage(`Authentication error: ${error.message}`)
      return null
    }

    setUser(data?.user || null)
    return data?.user || null
  }, [])

  // Initial load
  useEffect(() => {
    let isMounted = true

    async function initialize() {
      setIsLoading(true)
      await initAuth()
      await Promise.all([fetchEvent(), fetchSeats()])
      if (isMounted) {
        setIsLoading(false)
      }
    }

    initialize()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setUser(session?.user || null)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [initAuth, fetchEvent, fetchSeats])

  // Handle Realtime seat changes from Supabase
  const handleRealtimeSeatChange = useCallback((payload) => {
    if (payload.eventType === 'UPDATE') {
      const updatedSeat = payload.new
      setSeats((prev) =>
        prev.map((s) => (s.id === updatedSeat.id ? updatedSeat : s))
      )

      // If seat became unavailable, deselect locally
      if (updatedSeat.status !== 'available') {
        setSelectedSeatIds((prev) => {
          if (prev.has(updatedSeat.id)) {
            const next = new Set(prev)
            next.delete(updatedSeat.id)
            return next
          }
          return prev
        })
      }
    } else if (payload.eventType === 'INSERT') {
      setSeats((prev) => [...prev, payload.new])
    } else if (payload.eventType === 'DELETE') {
      setSeats((prev) => prev.filter((s) => s.id !== payload.old.id))
      setSelectedSeatIds((prev) => {
        if (prev.has(payload.old.id)) {
          const next = new Set(prev)
          next.delete(payload.old.id)
          return next
        }
        return prev
      })
    }
  }, [])

  // Subscribe to public.seats via realtime
  useSeatsRealtime(EVENT_ID, handleRealtimeSeatChange)

  // Normalize seats: if a held seat's locked_until is expired, display it as available
  const normalizedSeats = useMemo(() => {
    return seats.map((seat) => {
      if (seat.status === 'held' && seat.locked_until) {
        const isExpired = new Date(seat.locked_until).getTime() <= currentTime
        if (isExpired) {
          return {
            ...seat,
            status: 'available',
            locked_by: null,
            locked_until: null,
          }
        }
      }
      return seat
    })
  }, [seats, currentTime])

  // Current user's held seats (using normalized seats)
  const userHeldSeats = useMemo(() => {
    if (!user) return []
    return normalizedSeats.filter(
      (s) => s.status === 'held' && s.locked_by === user.id
    )
  }, [normalizedSeats, user])

  // Locate the latest active hold expiry timestamp for current user
  const latestLockedUntil = useMemo(() => {
    if (userHeldSeats.length === 0) return null
    const timestamps = userHeldSeats
      .map((s) => new Date(s.locked_until).getTime())
      .filter((t) => !isNaN(t))
    if (timestamps.length === 0) return null
    return new Date(Math.max(...timestamps)).toISOString()
  }, [userHeldSeats])

  // Hold timer hook with auto-refresh on expiration
  const handleTimerExpire = useCallback(() => {
    setErrorMessage('Your seat hold has expired. Please select seats again.')
    setSuccessMessage(null)
    fetchSeats()
  }, [fetchSeats])

  const {
    formatted: timerFormatted,
    isActive: isTimerActive,
    isExpired: isTimerExpired,
  } = useHoldTimer(latestLockedUntil, handleTimerExpire)

  // Toggle local selection of an available seat
  const handleToggleSeat = useCallback((seat) => {
    setErrorMessage(null)

    setSelectedSeatIds((prev) => {
      const next = new Set(prev)
      if (next.has(seat.id)) {
        next.delete(seat.id)
      } else {
        next.add(seat.id)
      }
      return next
    })
  }, [])

  // Hold selected seats via lock_seats RPC
  const handleHoldSeats = useCallback(async () => {
    if (selectedSeatIds.size === 0) return

    setIsHolding(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    const seatIds = Array.from(selectedSeatIds)

    const { data, error } = await supabase.rpc('lock_seats', {
      p_event_id: EVENT_ID,
      p_seat_ids: seatIds,
    })

    setIsHolding(false)

    if (error) {
      console.error('Lock error:', error)
      setErrorMessage(`Lock error: ${error.message}`)
      await fetchSeats()
      return
    }

    if (data?.success) {
      setSuccessMessage('Seats successfully held for 5 minutes!')
      setSelectedSeatIds(new Set())
      await fetchSeats()
    } else {
      setErrorMessage(data?.message || 'Failed to hold one or more seats.')
      await fetchSeats()
    }
  }, [selectedSeatIds, fetchSeats])

  // Atomic confirm_booking RPC
  const handleConfirmBooking = useCallback(async () => {
    if (userHeldSeats.length === 0) return

    setIsConfirming(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    const heldSeatIds = userHeldSeats.map((s) => s.id)
    const heldSeatLabels = userHeldSeats
      .map((s) => `${s.row_label}${s.seat_number}`)
      .sort()

    const { data, error } = await supabase.rpc('confirm_booking', {
      p_event_id: EVENT_ID,
      p_seat_ids: heldSeatIds,
    })

    setIsConfirming(false)

    if (error) {
      console.error('Confirm booking RPC error:', error)
      setErrorMessage(`Booking failed: ${error.message}`)
      await fetchSeats()
      return
    }

    if (data?.success) {
      setConfirmedBooking({
        bookingId: data.booking_id,
        totalAmount: data.total_amount,
        seatCount: data.seat_count,
        seats: heldSeatLabels,
      })
      setSuccessMessage('🎉 Booking confirmed successfully!')
      setSelectedSeatIds(new Set())
      await fetchSeats()
    } else {
      setErrorMessage(data?.message || 'Booking confirmation failed.')
      await fetchSeats()
    }
  }, [userHeldSeats, fetchSeats])

  // Dismiss confirmation banner / book more
  const handleDismissConfirmation = useCallback(() => {
    setConfirmedBooking(null)
    setSuccessMessage(null)
  }, [])

  // List of locally selected seat objects
  const selectedSeatObjects = useMemo(() => {
    return normalizedSeats.filter((s) => selectedSeatIds.has(s.id))
  }, [normalizedSeats, selectedSeatIds])

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-logo">💺</div>
          <div>
            <h1 className="brand-title">SeatSync</h1>
            <p className="brand-subtitle">Realtime High-Concurrency Seat Booking</p>
          </div>
        </div>

        {user && (
          <div className="user-badge" title={user.id}>
            <span className="user-status-dot" />
            <span className="user-id">Session: {user.id.slice(0, 8)}...</span>
          </div>
        )}
      </header>

      {event && (
        <section className="event-banner">
          <div className="event-info">
            <h2 className="event-name">{event.name}</h2>
            <div className="event-meta">
              <span>📍 {event.venue}</span>
              <span>
                🗓 {new Date(event.event_time).toLocaleDateString(undefined, {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
          <div className="event-badge">₹{PRICE_PER_SEAT} / seat</div>
        </section>
      )}

      {isLoading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Connecting to SeatSync & loading auditorium...</p>
        </div>
      ) : (
        <main className="booking-layout">
          <section className="auditorium-section">
            <SeatMap
              seats={normalizedSeats}
              currentUserId={user?.id}
              selectedSeatIds={selectedSeatIds}
              onToggleSeat={handleToggleSeat}
            />
          </section>

          <section className="summary-section">
            <BookingSummary
              selectedSeats={selectedSeatObjects}
              userHeldSeats={userHeldSeats}
              pricePerSeat={PRICE_PER_SEAT}
              onHoldSeats={handleHoldSeats}
              isHolding={isHolding}
              timerFormatted={timerFormatted}
              isTimerActive={isTimerActive}
              isTimerExpired={isTimerExpired}
              onConfirmBooking={handleConfirmBooking}
              isConfirming={isConfirming}
              confirmedBooking={confirmedBooking}
              onDismissConfirmation={handleDismissConfirmation}
              errorMessage={errorMessage}
              successMessage={successMessage}
            />
          </section>
        </main>
      )}
    </div>
  )
}

export default App