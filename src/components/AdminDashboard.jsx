import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function formatDate(dateStr) {
  if (!dateStr) return 'N/A'
  try {
    const [year, month, day] = dateStr.split('-').map(Number)
    const d = new Date(year, month - 1, day)
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatTime(timeStr) {
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

function formatRemainingSeconds(seconds) {
  if (seconds <= 0) return 'Expired'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function AdminDashboard({
  isAdmin = false,
  onNavigateToBooking,
  onDataChanged,
}) {
  const [activeAdminTab, setActiveAdminTab] = useState('events') // 'events' | 'shows' | 'bookings' | 'locks'

  // Data states
  const [events, setEvents] = useState([])
  const [shows, setShows] = useState([])
  const [allBookings, setAllBookings] = useState([])
  const [activeLocks, setActiveLocks] = useState([])

  // Loading & status states
  const [isLoading, setIsLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  // Event form
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventName, setEventName] = useState('')
  const [eventVenue, setEventVenue] = useState('')
  const [eventDate, setEventDate] = useState('2026-10-01')
  const [eventTime, setEventTime] = useState('18:00')

  // Show form
  const [showShowForm, setShowShowForm] = useState(false)
  const [showEventId, setShowEventId] = useState('')
  const [showDate, setShowDate] = useState('2026-10-02')
  const [showTime, setShowTime] = useState('14:00')
  const [showVenue, setShowVenue] = useState('Main Auditorium')
  const [showPrice, setShowPrice] = useState('200')
  const [showRows, setShowRows] = useState('A, B, C, D, E')
  const [showSeatsPerRow, setShowSeatsPerRow] = useState('5')

  // Ticker for active locks remaining time
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Clear notices after 5 seconds
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMsg])

  // Fetch Events
  const fetchEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMsg(`Failed to load events: ${error.message}`)
      return
    }
    setEvents(data || [])
    if (data && data.length > 0 && !showEventId) {
      setShowEventId(data[0].id)
      setShowVenue(data[0].venue || 'Main Auditorium')
    }
  }, [showEventId])

  // Fetch Shows
  const fetchShows = useCallback(async () => {
    const { data, error } = await supabase
      .from('shows')
      .select('*, events(id, name)')
      .order('show_date', { ascending: false })
      .order('show_time', { ascending: true })

    if (error) {
      setErrorMsg(`Failed to load shows: ${error.message}`)
      return
    }
    setShows(data || [])
  }, [])

  // Fetch All Bookings
  const fetchAllBookings = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        user_id,
        total_amount,
        status,
        created_at,
        events (id, name, venue),
        shows (id, show_date, show_time, venue, price),
        booking_seats (
          id,
          show_seats (id, row_label, seat_number)
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMsg(`Failed to load bookings: ${error.message}`)
      return
    }
    setAllBookings(data || [])
  }, [])

  // Fetch Active Seat Locks
  const fetchActiveLocks = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_get_active_locks')

    if (error) {
      setErrorMsg(`Failed to fetch active seat locks: ${error.message}`)
      return
    }
    setActiveLocks(Array.isArray(data) ? data : [])
  }, [])

  // Load data for active tab
  useEffect(() => {
    if (!isAdmin) return
    let isMounted = true

    const loadData = async () => {
      await Promise.resolve()
      if (!isMounted) return

      setIsLoading(true)
      if (activeAdminTab === 'events') {
        await fetchEvents()
      } else if (activeAdminTab === 'shows') {
        await Promise.all([fetchShows(), fetchEvents()])
      } else if (activeAdminTab === 'bookings') {
        await fetchAllBookings()
      } else if (activeAdminTab === 'locks') {
        await fetchActiveLocks()
      }
      if (isMounted) setIsLoading(false)
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [isAdmin, activeAdminTab, fetchEvents, fetchShows, fetchAllBookings, fetchActiveLocks])

  const handleTabChange = (tab) => {
    setActiveAdminTab(tab)
    setErrorMsg(null)
    setSuccessMsg(null)
  }

  // Create Event Handler
  const handleCreateEvent = async (e) => {
    e.preventDefault()
    if (!eventName.trim() || !eventVenue.trim()) {
      setErrorMsg('Event name and venue are required.')
      return
    }

    setActionLoading(true)
    setErrorMsg(null)

    const eventTimeIso = `${eventDate}T${eventTime}:00+05:30`
    const { data, error } = await supabase
      .from('events')
      .insert({
        name: eventName.trim(),
        venue: eventVenue.trim(),
        event_time: eventTimeIso,
      })
      .select()

    setActionLoading(false)

    if (error) {
      setErrorMsg(`Failed to create event: ${error.message}`)
      return
    }

    setSuccessMsg(`Event "${eventName}" created successfully!`)
    setEventName('')
    setShowEventForm(false)
    await fetchEvents()
    if (onDataChanged) onDataChanged()
    if (data?.[0]) setShowEventId(data[0].id)
  }

  // Create Show Handler
  const handleCreateShow = async (e) => {
    e.preventDefault()
    if (!showEventId) {
      setErrorMsg('Please select an event for this show.')
      return
    }
    if (!showVenue.trim()) {
      setErrorMsg('Venue is required.')
      return
    }
    const priceNum = parseFloat(showPrice)
    if (isNaN(priceNum) || priceNum <= 0) {
      setErrorMsg('Please enter a valid ticket price.')
      return
    }

    const rowLabels = showRows
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean)

    if (rowLabels.length === 0) {
      setErrorMsg('Please specify at least one row label.')
      return
    }

    const seatsPerRow = parseInt(showSeatsPerRow, 10)
    if (isNaN(seatsPerRow) || seatsPerRow < 1 || seatsPerRow > 50) {
      setErrorMsg('Seats per row must be between 1 and 50.')
      return
    }

    setActionLoading(true)
    setErrorMsg(null)

    const { data, error } = await supabase.rpc('admin_create_show', {
      p_event_id: showEventId,
      p_show_date: showDate,
      p_show_time: `${showTime}:00`,
      p_venue: showVenue.trim(),
      p_price: priceNum,
      p_row_labels: rowLabels,
      p_seats_per_row: seatsPerRow,
    })

    setActionLoading(false)

    if (error) {
      setErrorMsg(`Failed to create show: ${error.message}`)
      return
    }

    if (data?.success) {
      setSuccessMsg(
        `Show created with ${data.seat_count} seats (${rowLabels.join(', ')} × ${seatsPerRow})!`
      )
      setShowShowForm(false)
      await fetchShows()
      if (onDataChanged) onDataChanged()
    } else {
      setErrorMsg(data?.message || 'Failed to create show.')
    }
  }

  // Cancel Booking Handler
  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm(`Are you sure you want to cancel booking ${bookingId.slice(0, 8)}...? Seats will be released immediately.`)) {
      return
    }

    setActionLoading(true)
    setErrorMsg(null)

    const { data, error } = await supabase.rpc('admin_cancel_booking', {
      p_booking_id: bookingId,
    })

    setActionLoading(false)

    if (error) {
      setErrorMsg(`Cancellation failed: ${error.message}`)
      return
    }

    if (data?.success) {
      setSuccessMsg(`Booking cancelled and ${data.released_seats || 'all'} seat(s) released back to inventory!`)
      await fetchAllBookings()
      if (onDataChanged) onDataChanged()
    } else {
      setErrorMsg(data?.message || 'Cancellation failed.')
    }
  }

  // Unauthorized guard
  if (!isAdmin) {
    return (
      <div className="admin-container">
        <div className="unauthorized-card">
          <div className="unauthorized-icon">⛔</div>
          <h2>Unauthorized Access</h2>
          <p>
            You do not have administrator permissions to access this area.
            Administrative rights must be assigned in the database.
          </p>
          {onNavigateToBooking && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={onNavigateToBooking}
            >
              Return to Bookings
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="admin-container" role="region" aria-label="Admin Dashboard">
      <div className="admin-header">
        <div>
          <span className="admin-badge">Admin Panel</span>
          <h2 className="admin-title">System Administration</h2>
          <p className="admin-subtitle">
            Manage movies, shows, seat layouts, ticket pricing, and booking cancellations
          </p>
        </div>
        <div className="admin-header-actions">
          {onNavigateToBooking && (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onNavigateToBooking}
            >
              ← Back to App
            </button>
          )}
        </div>
      </div>

      {/* Admin Sub-Navigation */}
      <nav className="admin-subnav" aria-label="Admin Sections">
        <button
          type="button"
          className={`admin-subnav-btn ${activeAdminTab === 'events' ? 'admin-subnav-btn--active' : ''}`}
          onClick={() => handleTabChange('events')}
          aria-pressed={activeAdminTab === 'events'}
        >
          🎬 Events & Movies ({events.length})
        </button>
        <button
          type="button"
          className={`admin-subnav-btn ${activeAdminTab === 'shows' ? 'admin-subnav-btn--active' : ''}`}
          onClick={() => handleTabChange('shows')}
          aria-pressed={activeAdminTab === 'shows'}
        >
          ⏰ Shows & Schedules ({shows.length})
        </button>
        <button
          type="button"
          className={`admin-subnav-btn ${activeAdminTab === 'bookings' ? 'admin-subnav-btn--active' : ''}`}
          onClick={() => handleTabChange('bookings')}
          aria-pressed={activeAdminTab === 'bookings'}
        >
          📑 All Bookings ({allBookings.length})
        </button>
        <button
          type="button"
          className={`admin-subnav-btn ${activeAdminTab === 'locks' ? 'admin-subnav-btn--active' : ''}`}
          onClick={() => handleTabChange('locks')}
          aria-pressed={activeAdminTab === 'locks'}
        >
          🔒 Active Seat Locks ({activeLocks.length})
        </button>
      </nav>

      {/* Notifications */}
      {successMsg && (
        <div className="alert alert--success" role="status">
          ✓ {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="alert alert--error" role="alert">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* TAB 1: EVENTS */}
      {activeAdminTab === 'events' && (
        <section className="admin-section">
          <div className="admin-section-header">
            <h3>Events / Movies</h3>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setShowEventForm((prev) => !prev)}
            >
              {showEventForm ? 'Cancel' : '+ Create Event'}
            </button>
          </div>

          {showEventForm && (
            <form className="admin-form-card" onSubmit={handleCreateEvent}>
              <h4>Add New Event</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="evt-name">Event Name *</label>
                  <input
                    id="evt-name"
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="e.g., Inception - IMAX Screening"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="evt-venue">Venue *</label>
                  <input
                    id="evt-venue"
                    type="text"
                    value={eventVenue}
                    onChange={(e) => setEventVenue(e.target.value)}
                    placeholder="e.g., Cinema Hall 1"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="evt-date">Date</label>
                  <input
                    id="evt-date"
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="evt-time">Time</label>
                  <input
                    id="evt-time"
                    type="time"
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Creating Event...' : 'Save Event'}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setShowEventForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {isLoading ? (
            <div className="loading-state" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true" />
              <p>Loading events...</p>
            </div>
          ) : events.length === 0 ? (
            <p className="empty-notice">No events created yet.</p>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Event Name</th>
                    <th>Venue</th>
                    <th>Date & Time</th>
                    <th>Event ID</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((evt) => (
                    <tr key={evt.id}>
                      <td className="font-semibold">{evt.name}</td>
                      <td>📍 {evt.venue}</td>
                      <td>
                        {new Date(evt.event_time).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="value-mono" title={evt.id}>
                        {evt.id.slice(0, 13)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: SHOWS */}
      {activeAdminTab === 'shows' && (
        <section className="admin-section">
          <div className="admin-section-header">
            <h3>Show Schedules & Inventory</h3>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setShowShowForm((prev) => !prev)}
            >
              {showShowForm ? 'Cancel' : '+ Create Show'}
            </button>
          </div>

          {showShowForm && (
            <form className="admin-form-card" onSubmit={handleCreateShow}>
              <h4>Create Show & Generate Seat Inventory</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="shw-event">Select Event *</label>
                  <select
                    id="shw-event"
                    value={showEventId}
                    onChange={(e) => {
                      setShowEventId(e.target.value)
                      const sel = events.find((x) => x.id === e.target.value)
                      if (sel?.venue) setShowVenue(sel.venue)
                    }}
                    required
                  >
                    <option value="">-- Choose an Event --</option>
                    {events.map((evt) => (
                      <option key={evt.id} value={evt.id}>
                        {evt.name} ({evt.venue})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="shw-date">Show Date *</label>
                  <input
                    id="shw-date"
                    type="date"
                    value={showDate}
                    onChange={(e) => setShowDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="shw-time">Show Time *</label>
                  <input
                    id="shw-time"
                    type="time"
                    value={showTime}
                    onChange={(e) => setShowTime(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="shw-venue">Venue *</label>
                  <input
                    id="shw-venue"
                    type="text"
                    value={showVenue}
                    onChange={(e) => setShowVenue(e.target.value)}
                    placeholder="e.g., Main Auditorium"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="shw-price">Ticket Price (₹) *</label>
                  <input
                    id="shw-price"
                    type="number"
                    min="1"
                    step="1"
                    value={showPrice}
                    onChange={(e) => setShowPrice(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="shw-rows">Seat Rows (comma-separated)</label>
                  <input
                    id="shw-rows"
                    type="text"
                    value={showRows}
                    onChange={(e) => setShowRows(e.target.value)}
                    placeholder="A, B, C, D, E"
                    required
                  />
                  <small className="form-help">e.g., A, B, C, D, E</small>
                </div>

                <div className="form-group">
                  <label htmlFor="shw-seats">Seats Per Row</label>
                  <input
                    id="shw-seats"
                    type="number"
                    min="1"
                    max="50"
                    value={showSeatsPerRow}
                    onChange={(e) => setShowSeatsPerRow(e.target.value)}
                    required
                  />
                  <small className="form-help">Number of seats per row (e.g. 5)</small>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Creating Show & Seats...' : 'Create Show & Generate Seats'}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setShowShowForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {isLoading ? (
            <div className="loading-state" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true" />
              <p>Loading shows...</p>
            </div>
          ) : shows.length === 0 ? (
            <p className="empty-notice">No shows found.</p>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Venue</th>
                    <th>Ticket Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shows.map((shw) => (
                    <tr key={shw.id}>
                      <td className="font-semibold">{shw.events?.name || 'Live Event'}</td>
                      <td>{formatDate(shw.show_date)}</td>
                      <td>{formatTime(shw.show_time)}</td>
                      <td>📍 {shw.venue}</td>
                      <td className="text-success font-semibold">₹{Number(shw.price).toFixed(0)}</td>
                      <td>
                        <span className={`status-pill ${shw.status === 'active' ? 'status-pill--confirmed' : 'status-pill--cancelled'}`}>
                          {shw.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: BOOKINGS */}
      {activeAdminTab === 'bookings' && (
        <section className="admin-section">
          <div className="admin-section-header">
            <h3>All Bookings Across Users</h3>
            <button
              type="button"
              className="btn btn-refresh"
              onClick={fetchAllBookings}
            >
              🔄 Refresh Bookings
            </button>
          </div>

          {isLoading ? (
            <div className="loading-state" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true" />
              <p>Loading bookings...</p>
            </div>
          ) : allBookings.length === 0 ? (
            <p className="empty-notice">No bookings recorded in the system yet.</p>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Booking ID</th>
                    <th>Event & Show</th>
                    <th>Seats</th>
                    <th>Total</th>
                    <th>User ID</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {allBookings.map((b) => {
                    const rawSeats = (b.booking_seats || [])
                      .map((bs) => {
                        const seatObj = bs.show_seats || bs.seats
                        return seatObj ? `${seatObj.row_label}${seatObj.seat_number}` : null
                      })
                      .filter(Boolean)

                    const uniqueSeats = Array.from(new Set(rawSeats)).sort()
                    const isConfirmed = (b.status || 'confirmed').toLowerCase() === 'confirmed'

                    return (
                      <tr key={b.id}>
                        <td className="value-mono" title={b.id}>
                          {b.id.slice(0, 8)}...
                        </td>
                        <td>
                          <div className="font-semibold">{b.events?.name || 'Event'}</div>
                          <small className="text-muted">
                            {formatDate(b.shows?.show_date)} • {formatTime(b.shows?.show_time)}
                          </small>
                        </td>
                        <td>
                          <span className="seats-badge">
                            {uniqueSeats.length > 0 ? uniqueSeats.join(', ') : 'Reserved'}
                          </span>
                        </td>
                        <td className="font-semibold text-success">
                          ₹{Number(b.total_amount).toLocaleString('en-IN')}
                        </td>
                        <td className="value-mono text-muted" title={b.user_id}>
                          {b.user_id ? `${b.user_id.slice(0, 8)}...` : 'Guest'}
                        </td>
                        <td>
                          <span className={`status-pill ${isConfirmed ? 'status-pill--confirmed' : 'status-pill--cancelled'}`}>
                            {isConfirmed ? 'Confirmed' : 'Cancelled'}
                          </span>
                        </td>
                        <td>
                          {isConfirmed ? (
                            <button
                              type="button"
                              className="btn btn--danger-outline btn--sm"
                              onClick={() => handleCancelBooking(b.id)}
                              disabled={actionLoading}
                            >
                              Cancel Booking
                            </button>
                          ) : (
                            <span className="text-muted text-sm">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: ACTIVE SEAT LOCKS */}
      {activeAdminTab === 'locks' && (
        <section className="admin-section">
          <div className="admin-section-header">
            <h3>Active Temporary Seat Holds</h3>
            <button
              type="button"
              className="btn btn-refresh"
              onClick={fetchActiveLocks}
            >
              🔄 Refresh Locks
            </button>
          </div>

          <p className="section-description">
            Live monitor of seats currently held by users in checkout. Expired holds are automatically excluded.
          </p>

          {isLoading ? (
            <div className="loading-state" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true" />
              <p>Loading active locks...</p>
            </div>
          ) : activeLocks.length === 0 ? (
            <div className="empty-locks-card">
              <span>🟢</span>
              <p>No seats are currently locked. All unsold seats are available.</p>
            </div>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Seat</th>
                    <th>Event</th>
                    <th>Show Time</th>
                    <th>Locked By (User ID)</th>
                    <th>Locked Until</th>
                    <th>Remaining Time</th>
                  </tr>
                </thead>
                <tbody>
                  {activeLocks.map((lock) => {
                    const lockTime = new Date(lock.locked_until).getTime()
                    const remainingSec = Math.max(0, Math.floor((lockTime - currentTime) / 1000))

                    return (
                      <tr key={lock.seat_id}>
                        <td className="font-semibold text-primary">
                          <span className="lock-seat-chip">{lock.seat_label}</span>
                        </td>
                        <td>{lock.event_name}</td>
                        <td>
                          {formatDate(lock.show_date)} • {formatTime(lock.show_time)}
                        </td>
                        <td className="value-mono text-muted" title={lock.locked_by}>
                          {lock.locked_by ? `${lock.locked_by.slice(0, 10)}...` : 'N/A'}
                        </td>
                        <td>
                          {new Date(lock.locked_until).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td>
                          <span className={`timer-chip ${remainingSec > 60 ? 'timer-chip--ok' : 'timer-chip--urgent'}`}>
                            ⏱ {formatRemainingSeconds(remainingSec)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default AdminDashboard
