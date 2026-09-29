import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from './lib/supabase'
import SeatMap from './components/SeatMap'
import BookingSummary from './components/BookingSummary'
import AuthPage from './components/AuthPage'
import EventSelector from './components/EventSelector'
import DateSelector from './components/DateSelector'
import ShowSelector from './components/ShowSelector'
import MyBookings from './components/MyBookings'
import AdminDashboard from './components/AdminDashboard'
import { useSeatsRealtime } from './hooks/useSeatsRealtime'
import { useHoldTimer } from './hooks/useHoldTimer'
import './App.css'

function formatDateLabel(dateStr) {
  if (!dateStr) return ''
  try {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatTimeLabel(timeStr) {
  if (!timeStr) return ''
  try {
    const [hours, minutes] = timeStr.split(':')
    const hourNum = parseInt(hours, 10)
    const ampm = hourNum >= 12 ? 'PM' : 'AM'
    const displayHour = hourNum % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  } catch {
    return timeStr
  }
}

function App() {
  const [user, setUser] = useState(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  // Navigation tab: 'booking' | 'my_bookings' | 'admin'
  const [activeTab, setActiveTab] = useState('booking')
  const [myBookings, setMyBookings] = useState([])
  const [isLoadingBookings, setIsLoadingBookings] = useState(false)
  const [bookingsErrorMessage, setBookingsErrorMessage] = useState(null)

  // Step 1: Events
  const [events, setEvents] = useState([])
  const [selectedEventId, setSelectedEventId] = useState(null)

  // Step 2 & 3: Shows & Dates
  const [shows, setShows] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedShowId, setSelectedShowId] = useState(null)

  // Step 4: Show Seats
  const [seats, setSeats] = useState([])
  const [selectedSeatIds, setSelectedSeatIds] = useState(() => new Set())

  // Loading & Booking Status
  const [isLoading, setIsLoading] = useState(false)
  const [isHolding, setIsHolding] = useState(false)
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState('idle') // 'idle' | 'failed' | 'cancelled' | 'expired' | 'success'
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

  // Check admin role via secure RPC or profiles table
  const checkAdminStatus = useCallback(async (userObj) => {
    if (!userObj) {
      setIsAdmin(false)
      return false
    }

    try {
      const { data, error } = await supabase.rpc('get_my_profile')
      if (!error && data) {
        const admin = Boolean(data.is_admin)
        setIsAdmin(admin)
        return admin
      }

      // Fallback: direct query on profiles
      const { data: pData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userObj.id)
        .maybeSingle()

      const admin = pData?.role === 'admin'
      setIsAdmin(admin)
      return admin
    } catch {
      setIsAdmin(false)
      return false
    }
  }, [])

  // Fetch all seats for the active show
  const fetchSeats = useCallback(async (showId) => {
    if (!showId) {
      setSeats([])
      return
    }

    const { data, error } = await supabase
      .from('show_seats')
      .select('*')
      .eq('show_id', showId)
      .order('row_label', { ascending: true })
      .order('seat_number', { ascending: true })

    if (error) {
      console.error('Error fetching show seats:', error)
      setErrorMessage(`Failed to load seats: ${error.message}`)
      return
    }

    setSeats(data || [])
  }, [])

  // Fetch shows for a given event
  const fetchShows = useCallback(async (eventId) => {
    if (!eventId) {
      setShows([])
      return []
    }

    const { data, error } = await supabase
      .from('shows')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'active')
      .order('show_date', { ascending: true })
      .order('show_time', { ascending: true })

    if (error) {
      console.error('Error fetching shows:', error)
      setErrorMessage(`Failed to load shows: ${error.message}`)
      return []
    }

    setShows(data || [])
    return data || []
  }, [])

  // Fetch events list
  const fetchEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching events:', error)
      setErrorMessage(`Failed to load events: ${error.message}`)
      return []
    }

    setEvents(data || [])
    return data || []
  }, [])

  // Fetch current authenticated user's booking history
  const fetchMyBookings = useCallback(async () => {
    setIsLoadingBookings(true)
    setBookingsErrorMessage(null)

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        total_amount,
        status,
        created_at,
        events (
          id,
          name,
          venue
        ),
        shows (
          id,
          show_date,
          show_time,
          venue,
          price
        ),
        booking_seats (
          id,
          show_seats (
            id,
            row_label,
            seat_number
          )
        )
      `)
      .order('created_at', { ascending: false })

    setIsLoadingBookings(false)

    if (error) {
      console.error('Error fetching my bookings:', error)
      setBookingsErrorMessage(`Failed to load booking history: ${error.message}`)
      return []
    }

    setMyBookings(data || [])
    return data || []
  }, [])

  // Initial data loading workflow: Event -> Shows -> Date -> Show -> Seats
  const loadAppData = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    const loadedEvents = await fetchEvents()
    if (loadedEvents.length > 0) {
      const activeEvtId = loadedEvents[0].id
      setSelectedEventId(activeEvtId)

      const loadedShows = await fetchShows(activeEvtId)
      if (loadedShows.length > 0) {
        const firstDate = loadedShows[0].show_date
        setSelectedDate(firstDate)

        const showsOnDate = loadedShows.filter((s) => s.show_date === firstDate)
        const firstShow = showsOnDate[0]
        if (firstShow) {
          setSelectedShowId(firstShow.id)
          await fetchSeats(firstShow.id)
        }
      }
    }

    setIsLoading(false)
  }, [fetchEvents, fetchShows, fetchSeats])

  // Initial session check on mount
  useEffect(() => {
    let isMounted = true

    async function checkSession() {
      setIsCheckingAuth(true)
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.user) {
        if (isMounted) {
          setUser(session.user)
          await Promise.all([
            loadAppData(),
            fetchMyBookings(),
            checkAdminStatus(session.user),
          ])
        }
      } else {
        if (isMounted) {
          setUser(null)
          setIsAdmin(false)
        }
      }

      if (isMounted) {
        setIsCheckingAuth(false)
      }
    }

    checkSession()

    // Subscribe to auth state changes (login, signup, logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return

      const currentUser = session?.user || null
      setUser(currentUser)

      if (currentUser) {
        await Promise.all([
          loadAppData(),
          fetchMyBookings(),
          checkAdminStatus(currentUser),
        ])
      } else {
        // Clear application state on logout
        setEvents([])
        setShows([])
        setSeats([])
        setMyBookings([])
        setIsAdmin(false)
        setActiveTab('booking')
        setSelectedEventId(null)
        setSelectedDate(null)
        setSelectedShowId(null)
        setSelectedSeatIds(new Set())
        setConfirmedBooking(null)
        setErrorMessage(null)
        setSuccessMessage(null)
        setBookingsErrorMessage(null)
        setPaymentStatus('idle')
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [loadAppData, fetchMyBookings, checkAdminStatus])

  // Handle Realtime seat changes from Supabase show_seats
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

  // Subscribe to public.show_seats via realtime for selectedShowId
  useSeatsRealtime(user ? selectedShowId : null, handleRealtimeSeatChange)

  // Derived: Available dates from shows
  const availableDates = useMemo(() => {
    const datesSet = new Set(shows.map((s) => s.show_date))
    return Array.from(datesSet).sort()
  }, [shows])

  // Derived: Shows available for the selected date
  const showsForDate = useMemo(() => {
    if (!selectedDate) return []
    return shows.filter((s) => s.show_date === selectedDate)
  }, [shows, selectedDate])

  // Derived: Currently active event & show objects
  const activeEvent = useMemo(() => {
    return events.find((e) => e.id === selectedEventId) || null
  }, [events, selectedEventId])

  const activeShow = useMemo(() => {
    return shows.find((s) => s.id === selectedShowId) || null
  }, [shows, selectedShowId])

  // Active price per seat
  const pricePerSeat = useMemo(() => {
    return activeShow ? Number(activeShow.price) || 200 : 200
  }, [activeShow])

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

  // Current user's held seats in this active show
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

  // Hold timer expiration handler
  const handleTimerExpire = useCallback(() => {
    setPaymentStatus('expired')
    setErrorMessage('Your seat hold expired. Please select the seats again.')
    setSuccessMessage(null)
    if (selectedShowId) {
      fetchSeats(selectedShowId)
    }
  }, [selectedShowId, fetchSeats])

  const {
    formatted: timerFormatted,
    isActive: isTimerActive,
    isExpired: isTimerExpired,
  } = useHoldTimer(latestLockedUntil, handleTimerExpire)

  // Event selection change handler
  const handleSelectEvent = useCallback(
    async (eventId) => {
      if (eventId === selectedEventId) return

      setSelectedEventId(eventId)
      setSelectedSeatIds(new Set())
      setConfirmedBooking(null)
      setErrorMessage(null)
      setSuccessMessage(null)
      setPaymentStatus('idle')

      setIsLoading(true)
      const loadedShows = await fetchShows(eventId)
      if (loadedShows.length > 0) {
        const firstDate = loadedShows[0].show_date
        setSelectedDate(firstDate)

        const showsOnDate = loadedShows.filter((s) => s.show_date === firstDate)
        const firstShow = showsOnDate[0]
        if (firstShow) {
          setSelectedShowId(firstShow.id)
          await fetchSeats(firstShow.id)
        } else {
          setSelectedShowId(null)
          setSeats([])
        }
      } else {
        setSelectedDate(null)
        setSelectedShowId(null)
        setSeats([])
      }
      setIsLoading(false)
    },
    [selectedEventId, fetchShows, fetchSeats]
  )

  // Date selection change handler
  const handleSelectDate = useCallback(
    async (dateStr) => {
      if (dateStr === selectedDate) return

      setSelectedDate(dateStr)
      setSelectedSeatIds(new Set())
      setErrorMessage(null)
      setSuccessMessage(null)
      setPaymentStatus('idle')

      const showsOnDate = shows.filter((s) => s.show_date === dateStr)
      const firstShow = showsOnDate[0]
      if (firstShow) {
        setSelectedShowId(firstShow.id)
        await fetchSeats(firstShow.id)
      } else {
        setSelectedShowId(null)
        setSeats([])
      }
    },
    [selectedDate, shows, fetchSeats]
  )

  // Show selection change handler
  const handleSelectShow = useCallback(
    async (show) => {
      if (show.id === selectedShowId) return

      setSelectedShowId(show.id)
      setSelectedSeatIds(new Set())
      setErrorMessage(null)
      setSuccessMessage(null)
      setPaymentStatus('idle')

      await fetchSeats(show.id)
    },
    [selectedShowId, fetchSeats]
  )

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

  // Hold selected seats via lock_seats RPC (show-based)
  const handleHoldSeats = useCallback(async () => {
    if (selectedSeatIds.size === 0 || !selectedShowId) return

    setIsHolding(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    setPaymentStatus('idle')

    const seatIds = Array.from(selectedSeatIds)

    const { data, error } = await supabase.rpc('lock_seats', {
      p_show_id: selectedShowId,
      p_seat_ids: seatIds,
    })

    setIsHolding(false)

    if (error) {
      console.error('Lock error:', error)
      setErrorMessage(`Lock error: ${error.message}`)
      await fetchSeats(selectedShowId)
      return
    }

    if (data?.success) {
      setSuccessMessage('Seats successfully held! Proceed to payment.')
      setSelectedSeatIds(new Set())
      await fetchSeats(selectedShowId)
    } else {
      setErrorMessage(data?.message || 'Failed to hold one or more seats.')
      await fetchSeats(selectedShowId)
    }
  }, [selectedSeatIds, selectedShowId, fetchSeats])

  // Simulated Payment Success: calls atomic confirm_booking RPC (show-based)
  const handlePaySuccess = useCallback(async () => {
    if (userHeldSeats.length === 0 || !selectedShowId) return
    if (isPaymentProcessing) return

    if (isTimerExpired) {
      setPaymentStatus('expired')
      setErrorMessage('Your seat hold expired. Please select the seats again.')
      await fetchSeats(selectedShowId)
      return
    }

    setIsPaymentProcessing(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    const heldSeatIds = userHeldSeats.map((s) => s.id)
    const heldSeatLabels = userHeldSeats
      .map((s) => `${s.row_label}${s.seat_number}`)
      .sort()

    const { data, error } = await supabase.rpc('confirm_booking', {
      p_show_id: selectedShowId,
      p_seat_ids: heldSeatIds,
    })

    setIsPaymentProcessing(false)

    if (error) {
      console.error('Confirm booking RPC error:', error)
      setErrorMessage(`Payment processing error: ${error.message}`)
      await fetchSeats(selectedShowId)
      return
    }

    if (data?.success) {
      setPaymentStatus('success')
      setConfirmedBooking({
        bookingId: data.booking_id,
        eventName: activeEvent?.name || 'Live Event',
        showInfo: activeShow
          ? {
              date: formatDateLabel(activeShow.show_date),
              time: formatTimeLabel(activeShow.show_time),
              venue: activeShow.venue,
            }
          : null,
        totalAmount: data.total_amount,
        seatCount: data.seat_count,
        seats: heldSeatLabels,
        paymentStatus: 'Successful',
      })
      setSuccessMessage('🎉 Payment successful! Booking confirmed.')
      setSelectedSeatIds(new Set())

      // Refresh seats and user's booking history
      await Promise.all([fetchSeats(selectedShowId), fetchMyBookings()])
    } else {
      setErrorMessage(data?.message || 'Payment confirmation failed.')
      await fetchSeats(selectedShowId)
    }
  }, [
    userHeldSeats,
    selectedShowId,
    isPaymentProcessing,
    isTimerExpired,
    activeEvent,
    activeShow,
    fetchSeats,
    fetchMyBookings,
  ])

  // Simulated Payment Failure: calls release_held_seats RPC (show-based)
  const handlePayFailure = useCallback(async () => {
    if (userHeldSeats.length === 0 || !selectedShowId) return
    if (isPaymentProcessing) return

    setIsPaymentProcessing(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    const heldSeatIds = userHeldSeats.map((s) => s.id)

    const { data, error } = await supabase.rpc('release_held_seats', {
      p_show_id: selectedShowId,
      p_seat_ids: heldSeatIds,
    })

    setIsPaymentProcessing(false)

    if (error) {
      console.error('Release seats RPC error:', error)
      setErrorMessage(`Payment failed, error releasing seats: ${error.message}`)
      await fetchSeats(selectedShowId)
      return
    }

    if (data?.success) {
      setPaymentStatus('failed')
      setErrorMessage('Payment failed. Your seats have been released.')
      await fetchSeats(selectedShowId)
    } else {
      setErrorMessage(data?.message || 'Failed to release seats.')
      await fetchSeats(selectedShowId)
    }
  }, [userHeldSeats, selectedShowId, isPaymentProcessing, fetchSeats])

  // Payment Cancelled: calls release_held_seats RPC (show-based)
  const handleCancelPayment = useCallback(async () => {
    if (userHeldSeats.length === 0 || !selectedShowId) return
    if (isPaymentProcessing) return

    setIsPaymentProcessing(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    const heldSeatIds = userHeldSeats.map((s) => s.id)

    const { data, error } = await supabase.rpc('release_held_seats', {
      p_show_id: selectedShowId,
      p_seat_ids: heldSeatIds,
    })

    setIsPaymentProcessing(false)

    if (error) {
      console.error('Release seats RPC error:', error)
      setErrorMessage(`Error releasing seats on cancel: ${error.message}`)
      await fetchSeats(selectedShowId)
      return
    }

    if (data?.success) {
      setPaymentStatus('cancelled')
      setSuccessMessage('Payment cancelled. Your seats have been released.')
      await fetchSeats(selectedShowId)
    } else {
      setErrorMessage(data?.message || 'Failed to release seats on cancel.')
      await fetchSeats(selectedShowId)
    }
  }, [userHeldSeats, selectedShowId, isPaymentProcessing, fetchSeats])

  // Reset payment status back to idle
  const handleResetPayment = useCallback(() => {
    setPaymentStatus('idle')
    setErrorMessage(null)
    setSuccessMessage(null)
  }, [])

  // Dismiss confirmation banner / book more
  const handleDismissConfirmation = useCallback(() => {
    setConfirmedBooking(null)
    setPaymentStatus('idle')
    setSuccessMessage(null)
    setErrorMessage(null)
  }, [])

  // Navigate to My Bookings tab and refresh list
  const handleNavigateToMyBookings = useCallback(() => {
    setActiveTab('my_bookings')
    fetchMyBookings()
  }, [fetchMyBookings])

  // Logout handler
  const handleLogout = useCallback(async () => {
    setIsLoading(true)
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Sign out error:', err)
    } finally {
      setUser(null)
      setEvents([])
      setShows([])
      setSeats([])
      setMyBookings([])
      setIsAdmin(false)
      setActiveTab('booking')
      setSelectedEventId(null)
      setSelectedDate(null)
      setSelectedShowId(null)
      setSelectedSeatIds(new Set())
      setConfirmedBooking(null)
      setPaymentStatus('idle')
      setIsLoading(false)
    }
  }, [])

  // Callback when AuthPage successfully authenticates
  const handleAuthSuccess = useCallback(
    async (authenticatedUser) => {
      setUser(authenticatedUser)
      await Promise.all([
        loadAppData(),
        fetchMyBookings(),
        checkAdminStatus(authenticatedUser),
      ])
    },
    [loadAppData, fetchMyBookings, checkAdminStatus]
  )

  // List of locally selected seat objects
  const selectedSeatObjects = useMemo(() => {
    return normalizedSeats.filter((s) => selectedSeatIds.has(s.id))
  }, [normalizedSeats, selectedSeatIds])

  // User display name
  const userDisplayName = useMemo(() => {
    if (!user) return ''
    if (user.is_anonymous || !user.email) return 'Guest'
    return user.email
  }, [user])

  // Show details summary for summary/checkout components
  const activeShowInfo = useMemo(() => {
    if (!activeShow) return null
    return {
      date: formatDateLabel(activeShow.show_date),
      time: formatTimeLabel(activeShow.show_time),
      venue: activeShow.venue,
    }
  }, [activeShow])

  // Initial session loading state
  if (isCheckingAuth) {
    return (
      <div className="auth-loading-screen" role="status" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <p>Checking authentication...</p>
      </div>
    )
  }

  // If no active session, show AuthPage
  if (!user) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />
  }

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

        {/* Navigation Tabs */}
        <nav className="header-nav" aria-label="Main Navigation">
          <button
            type="button"
            className={`nav-tab ${activeTab === 'booking' ? 'nav-tab--active' : ''}`}
            onClick={() => setActiveTab('booking')}
            aria-pressed={activeTab === 'booking'}
          >
            🎟️ Book Seats
          </button>
          <button
            type="button"
            className={`nav-tab ${activeTab === 'my_bookings' ? 'nav-tab--active' : ''}`}
            onClick={handleNavigateToMyBookings}
            aria-pressed={activeTab === 'my_bookings'}
          >
            📋 My Bookings
            {myBookings.length > 0 && (
              <span className="nav-badge">{myBookings.length}</span>
            )}
          </button>
          {isAdmin && (
            <button
              type="button"
              className={`nav-tab nav-tab--admin ${activeTab === 'admin' ? 'nav-tab--active' : ''}`}
              onClick={() => setActiveTab('admin')}
              aria-pressed={activeTab === 'admin'}
            >
              ⚙️ Admin Panel
            </button>
          )}
        </nav>

        <div className="user-menu">
          <div className="user-badge" title={`User ID: ${user.id}`}>
            <span className="user-status-dot" />
            <span className="user-id">
              {userDisplayName}
              {isAdmin && <span className="admin-tag">ADMIN</span>}
            </span>
          </div>
          <button
            type="button"
            className="btn-logout"
            onClick={handleLogout}
            title="Sign out"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* VIEW: ADMIN DASHBOARD */}
      {activeTab === 'admin' ? (
        <main className="main-content-layout">
          <AdminDashboard
            isAdmin={isAdmin}
            onNavigateToBooking={() => setActiveTab('booking')}
            onDataChanged={loadAppData}
          />
        </main>
      ) : activeTab === 'my_bookings' ? (
        /* VIEW: MY BOOKINGS */
        <main className="main-content-layout">
          <MyBookings
            bookings={myBookings}
            isLoading={isLoadingBookings}
            errorMessage={bookingsErrorMessage}
            onRetry={fetchMyBookings}
            onNavigateToBooking={() => setActiveTab('booking')}
          />
        </main>
      ) : (
        /* VIEW: BOOKING WIZARD & SEAT MAP */
        <>
          <section className="booking-intro" aria-labelledby="booking-intro-title">
            <div className="booking-intro-copy">
              <p className="booking-kicker">YOUR NEXT GREAT NIGHT OUT</p>
              <h2 id="booking-intro-title">The best part starts with a seat.</h2>
              <p>Choose a movie or event, pick a showtime, and settle in.</p>
            </div>
            <div className="booking-intro-mark" aria-hidden="true">
              <span>SS</span>
              <i />
              <i />
              <i />
            </div>
          </section>

          {/* STEP 1, 2, 3: EVENT -> DATE -> SHOW SELECTOR */}
          <section className="booking-wizard-section">
            <div className="wizard-container">
              <EventSelector
                events={events}
                selectedEventId={selectedEventId}
                onSelectEvent={handleSelectEvent}
              />

              <DateSelector
                dates={availableDates}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
              />

              <ShowSelector
                shows={showsForDate}
                selectedShowId={selectedShowId}
                onSelectShow={handleSelectShow}
              />
            </div>
          </section>

          {/* STEP 4: SEAT MAP & CHECKOUT */}
          {isLoading ? (
            <div className="loading-state" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true" />
              <p>Loading show seats and availability...</p>
            </div>
          ) : activeShow ? (
            <main className="booking-layout">
              <section className="auditorium-section">
                <div className="auditorium-header">
                  <div className="auditorium-title-group">
                    <span className="step-tag">Step 4</span>
                    <h2 className="auditorium-title">Select Your Seats</h2>
                  </div>
                  <div className="auditorium-subtitle">
                    <span>{activeEvent?.name}</span>
                    <span className="bullet-sep">•</span>
                    <span>{activeShowInfo?.date}</span>
                    <span className="bullet-sep">•</span>
                    <span>{activeShowInfo?.time}</span>
                    <span className="bullet-sep">•</span>
                    <span>📍 {activeShow.venue}</span>
                  </div>
                </div>

                <SeatMap
                  seats={normalizedSeats}
                  currentUserId={user?.id}
                  selectedSeatIds={selectedSeatIds}
                  onToggleSeat={handleToggleSeat}
                />
              </section>

              <section className="summary-section">
                <BookingSummary
                  eventName={activeEvent?.name || 'Live Event'}
                  showInfo={activeShowInfo}
                  selectedSeats={selectedSeatObjects}
                  userHeldSeats={userHeldSeats}
                  pricePerSeat={pricePerSeat}
                  onHoldSeats={handleHoldSeats}
                  isHolding={isHolding}
                  timerFormatted={timerFormatted}
                  isTimerActive={isTimerActive}
                  isTimerExpired={isTimerExpired}
                  onPaySuccess={handlePaySuccess}
                  onPayFailure={handlePayFailure}
                  onCancelPayment={handleCancelPayment}
                  isPaymentProcessing={isPaymentProcessing}
                  paymentStatus={paymentStatus}
                  onResetPayment={handleResetPayment}
                  confirmedBooking={confirmedBooking}
                  onDismissConfirmation={handleDismissConfirmation}
                  onViewBookings={handleNavigateToMyBookings}
                  errorMessage={errorMessage}
                  successMessage={successMessage}
                />
              </section>
            </main>
          ) : (
            <div className="empty-state-card">
              <div className="empty-state-icon" aria-hidden="true">🎟️</div>
              <h3>No screenings available just yet</h3>
              <p>There are no active shows for this event. Please check back soon.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
