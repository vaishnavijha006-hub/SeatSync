/**
 * Formats a HH:MM or HH:MM:SS string to a 12-hour AM/PM label like "10:00 AM" or "02:00 PM".
 */
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

/**
 * ShowSelector renders the available shows (time, venue, price) for the selected date.
 */
export function ShowSelector({
  shows = [],
  selectedShowId = null,
  onSelectShow,
}) {
  if (!shows || shows.length === 0) {
    return (
      <div className="selector-group">
        <div className="step-header">
          <span className="step-number">Step 3</span>
          <h3 className="step-title">Select Show Time</h3>
        </div>
        <p className="empty-notice">No active shows available for this date.</p>
      </div>
    )
  }

  return (
    <div className="selector-group" role="region" aria-label="Show Selection">
      <div className="step-header">
        <span className="step-number">Step 3</span>
        <h3 className="step-title">Select Show Time</h3>
      </div>

      <div className="show-list">
        {shows.map((show) => {
          const isSelected = show.id === selectedShowId
          return (
            <button
              key={show.id}
              type="button"
              className={`show-card-btn ${isSelected ? 'show-card-btn--active' : ''}`}
              onClick={() => onSelectShow(show)}
              aria-pressed={isSelected}
            >
              <div className="show-time">{formatTime(show.show_time)}</div>
              <div className="show-meta">
                <span className="show-venue">📍 {show.venue}</span>
                <span className="show-price">₹{Number(show.price).toFixed(0)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default ShowSelector
