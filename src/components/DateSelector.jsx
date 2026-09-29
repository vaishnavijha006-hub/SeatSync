/**
 * Formats a YYYY-MM-DD string into a friendly label like "Thu, 1 Oct"
 */
function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return dateStr
  }
}

/**
 * DateSelector renders available dates for the selected event.
 */
export function DateSelector({
  dates = [],
  selectedDate = null,
  onSelectDate,
}) {
  if (!dates || dates.length === 0) {
    return null
  }

  return (
    <div className="selector-group" role="region" aria-label="Date Selection">
      <div className="step-header">
        <span className="step-number">Step 2</span>
        <h3 className="step-title">Select Date</h3>
      </div>

      <div className="pill-list">
        {dates.map((dateStr) => {
          const isSelected = dateStr === selectedDate
          return (
            <button
              key={dateStr}
              type="button"
              className={`pill-btn ${isSelected ? 'pill-btn--active' : ''}`}
              onClick={() => onSelectDate(dateStr)}
              aria-pressed={isSelected}
            >
              <span className="pill-icon">📅</span>
              <span className="pill-label">{formatDate(dateStr)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default DateSelector
