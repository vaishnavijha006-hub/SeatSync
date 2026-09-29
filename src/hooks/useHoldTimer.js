import { useEffect, useState, useRef } from 'react'

/**
 * Hook to manage countdown timer for seat hold expiry based on database locked_until.
 *
 * @param {string|null} lockedUntil - ISO timestamp from database
 * @param {Function} onExpire - Callback invoked when the hold window expires
 */
export function useHoldTimer(lockedUntil, onExpire) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    if (!lockedUntil) {
      return
    }

    const targetTime = new Date(lockedUntil).getTime()

    const updateRemaining = () => {
      const remaining = Math.max(0, Math.floor((targetTime - Date.now()) / 1000))
      setSecondsLeft(remaining)

      if (remaining <= 0 && onExpireRef.current) {
        onExpireRef.current()
      }
    }

    // Initialize timer asynchronously to avoid synchronous setState inside effect body
    const timeoutId = setTimeout(updateRemaining, 0)
    const intervalId = setInterval(updateRemaining, 1000)

    return () => {
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [lockedUntil])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  return {
    secondsLeft,
    formatted,
    isExpired: Boolean(lockedUntil && secondsLeft <= 0),
    isActive: Boolean(lockedUntil && secondsLeft > 0),
  }
}

export default useHoldTimer
