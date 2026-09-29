/**
 * BookingSummary renders the selection checkout panel, price calculation,
 * hold actions, hold timer, and booking confirmation flow.
 */
export function BookingSummary({
  selectedSeats = [],
  userHeldSeats = [],
  pricePerSeat = 200,
  onHoldSeats,
  isHolding = false,
  timerFormatted = '00:00',
  isTimerActive = false,
  isTimerExpired = false,
  onConfirmBooking,
  isConfirming = false,
  confirmedBooking = null,
  onDismissConfirmation,
  errorMessage = null,
  successMessage = null,
}) {
  const selectedCount = selectedSeats.length
  const heldCount = userHeldSeats.length
  const hasSelection = selectedCount > 0
  const hasHeldSeats = heldCount > 0

  const selectedTotal = selectedCount * pricePerSeat
  const heldTotal = heldCount * pricePerSeat

  return (
    <aside className="booking-summary">
      <h2 className="summary-title">Booking Summary</h2>

      {errorMessage && (
        <div className="alert alert--error" role="alert">
          {errorMessage}
        </div>
      )}

      {successMessage && !confirmedBooking && (
        <div className="alert alert--success" role="status">
          {successMessage}
        </div>
      )}

      {/* CONFIRMED BOOKING SUCCESS STATE */}
      {confirmedBooking && (
        <div className="summary-card summary-card--confirmed" role="region" aria-label="Booking Confirmation Details">
          <div className="card-header">
            <span className="badge badge--success">✓ Confirmed</span>
            <span className="confirmed-icon">🎉</span>
          </div>

          <h3 className="card-title text-success">Booking Confirmed!</h3>
          <p className="card-description">
            Your seats have been successfully reserved and booked.
          </p>

          <div className="booking-details">
            <div className="summary-row">
              <span className="label">Booking ID:</span>
              <span className="value value-mono" title={confirmedBooking.bookingId}>
                {confirmedBooking.bookingId.slice(0, 13)}...
              </span>
            </div>

            <div className="summary-row">
              <span className="label">Seats:</span>
              <span className="value">
                {confirmedBooking.seats && confirmedBooking.seats.length > 0
                  ? confirmedBooking.seats.join(', ')
                  : `${confirmedBooking.seatCount} Seat(s)`}
              </span>
            </div>

            <div className="summary-row">
              <span className="label">Seat Count:</span>
              <span className="value">{confirmedBooking.seatCount}</span>
            </div>

            <div className="summary-row summary-row--total">
              <span className="label">Total Paid:</span>
              <span className="value-total text-success">
                ₹{Number(confirmedBooking.totalAmount).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {onDismissConfirmation && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onDismissConfirmation}
            >
              Book More Seats
            </button>
          )}
        </div>
      )}

      {/* ACTIVE HELD SEATS SECTION */}
      {hasHeldSeats && (
        <div className="summary-card summary-card--held">
          <div className="card-header">
            <span className="badge badge--held">Seats on Hold</span>
            {isTimerActive && (
              <span className="hold-timer" aria-live="polite">
                ⏱ {timerFormatted}
              </span>
            )}
            {isTimerExpired && (
              <span className="badge badge--expired">Hold Expired</span>
            )}
          </div>

          <div className="summary-row">
            <span className="label">Held Seats:</span>
            <span className="value">
              {userHeldSeats
                .map((s) => `${s.row_label}${s.seat_number}`)
                .sort()
                .join(', ')}
            </span>
          </div>

          <div className="summary-row">
            <span className="label">Held Count:</span>
            <span className="value">{heldCount}</span>
          </div>

          <div className="summary-row summary-row--total">
            <span className="label">Total Amount:</span>
            <span className="value-total">₹{heldTotal.toLocaleString('en-IN')}</span>
          </div>

          <button
            type="button"
            className="btn btn--confirm"
            onClick={onConfirmBooking}
            disabled={isConfirming || isTimerExpired || !hasHeldSeats}
          >
            {isConfirming ? 'Confirming Booking...' : 'Confirm Booking'}
          </button>
        </div>
      )}

      {/* LOCALLY SELECTED SEATS SECTION */}
      <div className="summary-card">
        <h3 className="card-title">New Selection</h3>

        <div className="summary-row">
          <span className="label">Selected Seats:</span>
          <span className="value">
            {hasSelection
              ? selectedSeats
                  .map((s) => `${s.row_label}${s.seat_number}`)
                  .sort()
                  .join(', ')
              : 'None'}
          </span>
        </div>

        <div className="summary-row">
          <span className="label">Seat Count:</span>
          <span className="value">{selectedCount}</span>
        </div>

        <div className="summary-row">
          <span className="label">Price per seat:</span>
          <span className="value">₹{pricePerSeat}</span>
        </div>

        <div className="summary-row summary-row--total">
          <span className="label">Subtotal:</span>
          <span className="value-total">₹{selectedTotal.toLocaleString('en-IN')}</span>
        </div>

        <button
          type="button"
          className="btn btn--hold"
          onClick={onHoldSeats}
          disabled={!hasSelection || isHolding}
        >
          {isHolding
            ? 'Holding Seats...'
            : `Hold ${selectedCount > 0 ? `${selectedCount} ` : ''}Seat${selectedCount !== 1 ? 's' : ''}`}
        </button>
      </div>

      <div className="price-note">
        <small>⚡ Seats are held for 5 minutes once reserved.</small>
      </div>
    </aside>
  )
}

export default BookingSummary
