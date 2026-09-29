import { useState } from 'react'

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

function formatDateTime(isoStr) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoStr
  }
}

export function MyBookings({
  bookings = [],
  isLoading = false,
  errorMessage = null,
  onRetry,
  onNavigateToBooking,
}) {
  const [expandedBookingId, setExpandedBookingId] = useState(null)

  const toggleExpand = (id) => {
    setExpandedBookingId((prev) => (prev === id ? null : id))
  }

  // Loading State
  if (isLoading) {
    return (
      <div className="bookings-container" role="region" aria-label="My Bookings">
        <div className="bookings-header">
          <h2 className="bookings-page-title">My Bookings</h2>
          <p className="bookings-page-subtitle">Your reserved tickets and booking history</p>
        </div>
        <div className="loading-state" role="status" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <p>Loading your booking history...</p>
        </div>
      </div>
    )
  }

  // Error State
  if (errorMessage) {
    return (
      <div className="bookings-container" role="region" aria-label="My Bookings">
        <div className="bookings-header">
          <h2 className="bookings-page-title">My Bookings</h2>
          <p className="bookings-page-subtitle">Your reserved tickets and booking history</p>
        </div>
        <div className="bookings-error-card">
          <div className="error-icon">⚠️</div>
          <h3>Failed to Load Bookings</h3>
          <p>{errorMessage}</p>
          {onRetry && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  // Empty State
  if (!bookings || bookings.length === 0) {
    return (
      <div className="bookings-container" role="region" aria-label="My Bookings">
        <div className="bookings-header">
          <h2 className="bookings-page-title">My Bookings</h2>
          <p className="bookings-page-subtitle">Your reserved tickets and booking history</p>
        </div>
        <div className="empty-state-card">
          <div className="empty-state-icon">🎟️</div>
          <h3>No bookings yet</h3>
          <p>You haven&apos;t booked any tickets yet. Explore movies and live shows to reserve your seats.</p>
          {onNavigateToBooking && (
            <button
              type="button"
              className="btn btn--primary btn--book-now"
              onClick={onNavigateToBooking}
            >
              Book a Show
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bookings-container" role="region" aria-label="My Bookings">
      <div className="bookings-header">
        <div>
          <h2 className="bookings-page-title">My Bookings</h2>
          <p className="bookings-page-subtitle">
            {bookings.length} {bookings.length === 1 ? 'ticket' : 'tickets'} booked
          </p>
        </div>
        <div className="bookings-header-actions">
          {onRetry && (
            <button
              type="button"
              className="btn-refresh"
              onClick={onRetry}
              title="Refresh bookings"
            >
              🔄 Refresh
            </button>
          )}
          {onNavigateToBooking && (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onNavigateToBooking}
            >
              + Book Another Show
            </button>
          )}
        </div>
      </div>

      <div className="bookings-grid">
        {bookings.map((booking) => {
          // Extract seat labels safely
          const rawSeats = (booking.booking_seats || [])
            .map((bs) => {
              const seatObj = bs.show_seats || bs.seats
              return seatObj ? `${seatObj.row_label}${seatObj.seat_number}` : null
            })
            .filter(Boolean)

          // Prevent duplicate seat labels if join produces multiple records
          const uniqueSeats = Array.from(new Set(rawSeats)).sort()
          const seatCount = uniqueSeats.length || 1
          const isExpanded = expandedBookingId === booking.id

          const eventName = booking.events?.name || 'Live Event'
          const venue = booking.shows?.venue || booking.events?.venue || 'Auditorium'
          const showDate = booking.shows?.show_date
            ? formatDate(booking.shows.show_date)
            : 'Date TBD'
          const showTime = booking.shows?.show_time
            ? formatTime(booking.shows.show_time)
            : ''

          const status = booking.status || 'confirmed'
          const isConfirmed = status.toLowerCase() === 'confirmed'

          return (
            <article
              key={booking.id}
              className={`booking-card ${isConfirmed ? 'booking-card--confirmed' : 'booking-card--cancelled'}`}
            >
              <div className="booking-card-top">
                <div className="booking-event-title-group">
                  <h3 className="booking-event-name">{eventName}</h3>
                  <div className="booking-show-meta">
                    <span>🗓 {showDate}</span>
                    {showTime && <span>• ⏰ {showTime}</span>}
                    <span>• 📍 {venue}</span>
                  </div>
                </div>

                <div className="booking-status-tag-group">
                  <span
                    className={`status-pill ${
                      isConfirmed ? 'status-pill--confirmed' : 'status-pill--cancelled'
                    }`}
                  >
                    {isConfirmed ? '✓ Confirmed' : '✕ Cancelled'}
                  </span>
                </div>
              </div>

              <div className="booking-card-mid">
                <div className="booking-mid-col">
                  <span className="mid-label">Seats</span>
                  <span className="mid-value mid-value--seats">
                    {uniqueSeats.length > 0 ? uniqueSeats.join(', ') : 'Seats reserved'}
                  </span>
                </div>

                <div className="booking-mid-col">
                  <span className="mid-label">Quantity</span>
                  <span className="mid-value">
                    {seatCount} {seatCount === 1 ? 'Ticket' : 'Tickets'}
                  </span>
                </div>

                <div className="booking-mid-col">
                  <span className="mid-label">Total Amount</span>
                  <span className="mid-value mid-value--price">
                    ₹{Number(booking.total_amount).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Expandable Details Section */}
              {isExpanded && (
                <div className="booking-card-expanded">
                  <div className="expanded-row">
                    <span className="expanded-label">Booking ID:</span>
                    <span className="expanded-value expanded-value--mono" title={booking.id}>
                      {booking.id}
                    </span>
                  </div>

                  <div className="expanded-row">
                    <span className="expanded-label">Booked On:</span>
                    <span className="expanded-value">{formatDateTime(booking.created_at)}</span>
                  </div>

                  {booking.shows?.price && (
                    <div className="expanded-row">
                      <span className="expanded-label">Ticket Rate:</span>
                      <span className="expanded-value">
                        ₹{Number(booking.shows.price).toFixed(0)} per seat
                      </span>
                    </div>
                  )}

                  <div className="expanded-row">
                    <span className="expanded-label">Venue:</span>
                    <span className="expanded-value">{venue}</span>
                  </div>
                </div>
              )}

              <div className="booking-card-footer">
                <span className="booking-date-subtext">
                  Booked {formatDateTime(booking.created_at)}
                </span>

                <button
                  type="button"
                  className="btn-expand"
                  onClick={() => toggleExpand(booking.id)}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? 'Hide Details ▲' : 'View Details ▼'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

export default MyBookings
