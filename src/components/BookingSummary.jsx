/**
 * BookingSummary renders the selection checkout panel, price calculation,
 * hold actions, hold timer, and booking confirmation button.
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
  bookingConfirmed = false,
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

      {successMessage && (
        <div className="alert alert--success" role="status">
          {successMessage}
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

          {!bookingConfirmed ? (
            <button
              type="button"
              className="btn btn--confirm"
              onClick={onConfirmBooking}
              disabled={isConfirming || isTimerExpired}
            >
              {isConfirming ? 'Confirming...' : 'Confirm Booking'}
            </button>
          ) : (
            <div className="confirmation-badge">
              🎉 Booking confirmed! (Payment integration in next phase)
            </div>
          )}
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
          {isHolding ? 'Holding Seats...' : `Hold ${selectedCount > 0 ? `${selectedCount} ` : ''}Seat${selectedCount !== 1 ? 's' : ''}`}
        </button>
      </div>

      <div className="price-note">
        <small>⚡ Seats are held for 5 minutes once reserved.</small>
      </div>
    </aside>
  )
}

export default BookingSummary
