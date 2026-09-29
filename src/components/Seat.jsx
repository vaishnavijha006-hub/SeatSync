/**
 * Seat component representing a single interactive seat in the auditorium map.
 */
export function Seat({
  seat,
  currentUserId,
  isLocallySelected,
  onToggleSelect,
}) {
  let state = 'available'

  if (seat.status === 'booked') {
    state = 'booked'
  } else if (seat.status === 'held') {
    if (seat.locked_by === currentUserId) {
      state = 'held-by-user'
    } else {
      state = 'held-by-other'
    }
  } else if (isLocallySelected) {
    state = 'selected'
  } else {
    state = 'available'
  }

  const isClickable = state === 'available' || state === 'selected'

  const handleClick = () => {
    if (!isClickable) return
    onToggleSelect(seat)
  }

  const getStatusLabel = () => {
    switch (state) {
      case 'selected':
        return 'Selected locally'
      case 'held-by-user':
        return 'Held by you'
      case 'held-by-other':
        return 'Held by someone else'
      case 'booked':
        return 'Booked'
      default:
        return 'Available'
    }
  }

  return (
    <button
      type="button"
      className={`seat seat--${state}`}
      onClick={handleClick}
      disabled={!isClickable}
      aria-label={`Seat ${seat.row_label}${seat.seat_number}, ${getStatusLabel()}`}
      title={`Seat ${seat.row_label}${seat.seat_number} - ${getStatusLabel()}`}
    >
      <span className="seat__label">
        {seat.row_label}{seat.seat_number}
      </span>
    </button>
  )
}

export default Seat
