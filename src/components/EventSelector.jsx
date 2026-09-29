/**
 * EventSelector renders a list of events/movies for the user to choose from.
 */
export function EventSelector({
  events = [],
  selectedEventId = null,
  onSelectEvent,
}) {
  if (!events || events.length === 0) {
    return null
  }

  return (
    <div className="selector-group" role="region" aria-label="Event Selection">
      <div className="step-header">
        <span className="step-number">Step 1</span>
        <h3 className="step-title">Select Movie / Event</h3>
      </div>

      <div className="event-list">
        {events.map((evt) => {
          const isSelected = evt.id === selectedEventId
          return (
            <button
              key={evt.id}
              type="button"
              className={`event-card-btn ${isSelected ? 'event-card-btn--active' : ''}`}
              onClick={() => onSelectEvent(evt.id)}
              aria-pressed={isSelected}
            >
              <div className="event-card-title">{evt.name}</div>
              <div className="event-card-meta">
                <span>📍 {evt.venue}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default EventSelector
