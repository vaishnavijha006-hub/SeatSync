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
  const [bookingConfirmed, setBookingConfirmed] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

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

  // Current user's held seats
  const userHeldSeats = useMemo(() => {
    if (!user) return []
    return seats.filter(
      (s) => s.status === 'held' && s.locked_by === user.id
    )
  }, [seats, user])

  // Locate the latest active hold expiry timestamp for user
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
    setBookingConfirmed(false)
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
    setSuccessMessage(null)

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

  // Handle booking confirmation (payment in next phase)
  const handleConfirmBooking = useCallback(() => {
    setIsConfirming(true)
    setErrorMessage(null)
    setTimeout(() => {
      setIsConfirming(false)
      setBookingConfirmed(true)
      setSuccessMessage('Booking confirmed! Payment gateway integration will follow in next phase.')
    }, 400)
  }, [])

  // List of locally selected seat objects
  const selectedSeatObjects = useMemo(() => {
    return seats.filter((s) => selectedSeatIds.has(s.id))
  }, [seats, selectedSeatIds])

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
              seats={seats}
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
              bookingConfirmed={bookingConfirmed}
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