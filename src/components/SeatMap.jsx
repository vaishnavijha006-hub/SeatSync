import Seat from './Seat'

/**
 * SeatMap renders the auditorium grid grouped by rows, screen/stage banner, and status legend.
 */
export function SeatMap({
  seats = [],
  currentUserId,
  selectedSeatIds = new Set(),
  onToggleSeat,
}) {
  // Dynamically group seats by row_label
  const rowMap = seats.reduce((acc, seat) => {
    if (!acc[seat.row_label]) {
      acc[seat.row_label] = []
    }
    acc[seat.row_label].push(seat)
    return acc
  }, {})

  // Sort rows alphabetically and seats by seat_number
  const sortedRowLabels = Object.keys(rowMap).sort()
  sortedRowLabels.forEach((label) => {
    rowMap[label].sort((a, b) => a.seat_number - b.seat_number)
  })

  return (
    <div className="seat-map">
      <div className="screen-container">
        <div className="screen-curve" />
        <span className="screen-label">STAGE / SCREEN</span>
      </div>

      <div className="seat-grid">
        {sortedRowLabels.map((rowLabel) => (
          <div key={rowLabel} className="seat-row">
            <span className="row-indicator">{rowLabel}</span>
            <div className="row-seats">
              {rowMap[rowLabel].map((seat) => (
                <Seat
                  key={seat.id}
                  seat={seat}
                  currentUserId={currentUserId}
                  isLocallySelected={selectedSeatIds.has(seat.id)}
                  onToggleSelect={onToggleSeat}
                />
              ))}
            </div>
            <span className="row-indicator">{rowLabel}</span>
          </div>
        ))}
      </div>

      <div className="legend">
        <div className="legend-item">
          <span className="legend-chip seat--available" />
          <span>Available</span>
        </div>
        <div className="legend-item">
          <span className="legend-chip seat--selected" />
          <span>Selected</span>
        </div>
        <div className="legend-item">
          <span className="legend-chip seat--held-by-user" />
          <span>Held by You</span>
        </div>
        <div className="legend-item">
          <span className="legend-chip seat--held-by-other" />
          <span>Held by Other</span>
        </div>
        <div className="legend-item">
          <span className="legend-chip seat--booked" />
          <span>Booked</span>
        </div>
      </div>
    </div>
  )
}

export default SeatMap
