/**
 * BookingSummary renders the selection summary, checkout & simulated payment panel,
 * hold countdown timer, and booking confirmation details.
 */
export function BookingSummary({
  eventName = 'Live Event',
  showInfo = null,
  selectedSeats = [],
  userHeldSeats = [],
  pricePerSeat = 200,
  onHoldSeats,
  isHolding = false,
  timerFormatted = '00:00',
  isTimerActive = false,
  isTimerExpired = false,
  onPaySuccess,
  onPayFailure,
  onCancelPayment,
  isPaymentProcessing = false,
  paymentStatus = 'idle',
  onResetPayment,
  confirmedBooking = null,
  onDismissConfirmation,
  onViewBookings,
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
      <h2 className="summary-title">Booking & Checkout</h2>

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
            Payment successful and your seats are booked.
          </p>

          <div className="booking-details">
            <div className="summary-row">
              <span className="label">Event:</span>
              <span className="value">{confirmedBooking.eventName || eventName}</span>
            </div>

            {(confirmedBooking.showInfo || showInfo) && (
              <div className="summary-row">
                <span className="label">Show:</span>
                <span className="value">
                  {(confirmedBooking.showInfo || showInfo).date} • {(confirmedBooking.showInfo || showInfo).time}
                </span>
              </div>
            )}

            <div className="summary-row">
              <span className="label">Payment Status:</span>
              <span className="value text-success font-semibold">
                {confirmedBooking.paymentStatus || 'Successful'}
              </span>
            </div>

            <div className="summary-row">
              <span className="label">Booking ID:</span>
              <span className="value value-mono" title={confirmedBooking.bookingId}>
                {confirmedBooking.bookingId ? `${confirmedBooking.bookingId.slice(0, 13)}...` : 'N/A'}
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
              <span className="label">Number of Seats:</span>
              <span className="value">{confirmedBooking.seatCount}</span>
            </div>

            <div className="summary-row summary-row--total">
              <span className="label">Total Paid:</span>
              <span className="value-total text-success">
                ₹{Number(confirmedBooking.totalAmount).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="confirmed-action-group">
            {onViewBookings && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={onViewBookings}
              >
                View in My Bookings
              </button>
            )}
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
        </div>
      )}

      {/* SIMULATED PAYMENT & CHECKOUT CARD */}
      {!confirmedBooking && hasHeldSeats && (
        <div className="summary-card summary-card--payment" role="region" aria-label="Simulated Payment">
          <div className="card-header">
            <span className="badge badge--held">Checkout & Payment</span>
            {isTimerActive && (
              <span className="hold-timer" role="timer" aria-live="off" aria-label={`Hold expires in ${timerFormatted}`}>
                <span aria-hidden="true">◷</span>
                <span>Hold</span>
                <strong>{timerFormatted}</strong>
              </span>
            )}
            {isTimerExpired && (
              <span className="badge badge--expired">Hold Expired</span>
            )}
          </div>

          <div className="payment-event-name">{eventName}</div>
          {showInfo && (
            <div className="payment-show-meta">
              <span>🗓 {showInfo.date}</span>
              <span>⏰ {showInfo.time}</span>
              <span>📍 {showInfo.venue}</span>
            </div>
          )}

          <div className="payment-details">
            <div className="summary-row">
              <span className="label">Seats:</span>
              <span className="value">
                {userHeldSeats
                  .map((s) => `${s.row_label}${s.seat_number}`)
                  .sort()
                  .join(', ')}
              </span>
            </div>

            <div className="summary-row">
              <span className="label">Price:</span>
              <span className="value">₹{pricePerSeat} × {heldCount}</span>
            </div>

            <div className="summary-row">
              <span className="label">Number of seats:</span>
              <span className="value">{heldCount}</span>
            </div>

            <div className="summary-row summary-row--total">
              <span className="label">Total Amount:</span>
              <span className="value-total">₹{heldTotal.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Payment Action Buttons */}
          <div className="payment-actions">
            <button
              type="button"
              className="btn btn--pay"
              onClick={onPaySuccess}
              disabled={isPaymentProcessing || isTimerExpired || !hasHeldSeats}
            >
              {isPaymentProcessing ? (
                <span className="btn-loading">
                  <span className="spinner-inline" /> Processing Payment...
                </span>
              ) : (
                `Pay ₹${heldTotal.toLocaleString('en-IN')}`
              )}
            </button>

            <button
              type="button"
              className="btn btn--pay-fail"
              onClick={onPayFailure}
              disabled={isPaymentProcessing || isTimerExpired || !hasHeldSeats}
            >
              Simulate Payment Failure
            </button>

            <button
              type="button"
              className="btn btn--pay-cancel"
              onClick={onCancelPayment}
              disabled={isPaymentProcessing || !hasHeldSeats}
            >
              Cancel Payment
            </button>
          </div>

          <div className="price-note">
            <small>⚠️ Simulated payment for testing. No real card charged.</small>
          </div>
        </div>
      )}

      {/* PAYMENT STATUS FEEDBACK (FAILED / CANCELLED / EXPIRED) */}
      {!confirmedBooking && !hasHeldSeats && (paymentStatus === 'failed' || paymentStatus === 'cancelled' || paymentStatus === 'expired') && (
        <div className="summary-card summary-card--status-notice">
          {paymentStatus === 'failed' && (
            <>
              <h4 className="notice-title text-danger">Payment Failed</h4>
              <p className="notice-desc">Your seats have been released and are now available.</p>
            </>
          )}
          {paymentStatus === 'cancelled' && (
            <>
              <h4 className="notice-title text-muted">Payment Cancelled</h4>
              <p className="notice-desc">Your seats have been released and returned to available.</p>
            </>
          )}
          {paymentStatus === 'expired' && (
            <>
              <h4 className="notice-title text-warning">Hold Expired</h4>
              <p className="notice-desc">Your 5-minute hold window expired. Please select seats again.</p>
            </>
          )}
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onResetPayment}
          >
            Back to Seats
          </button>
        </div>
      )}

      {/* LOCALLY SELECTED SEATS SECTION */}
      {!confirmedBooking && (
        <div className="summary-card">
          <h3 className="card-title">New Selection</h3>

          {showInfo && (
            <div className="summary-row">
              <span className="label">Show:</span>
              <span className="value">{showInfo.date} • {showInfo.time}</span>
            </div>
          )}

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
            disabled={!hasSelection || isHolding || hasHeldSeats}
          >
            {isHolding
              ? 'Holding Seats...'
              : `Hold ${selectedCount > 0 ? `${selectedCount} ` : ''}Seat${selectedCount !== 1 ? 's' : ''}`}
          </button>

          {hasHeldSeats && hasSelection && (
            <p className="selection-warning">
              <small>Please complete or cancel your active checkout before holding new seats.</small>
            </p>
          )}
        </div>
      )}

      <div className="price-note">
        <small>⚡ Seats are held for 5 minutes once reserved.</small>
      </div>
    </aside>
  )
}

export default BookingSummary
