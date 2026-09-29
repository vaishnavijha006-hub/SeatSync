import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Hook to subscribe to realtime changes on the public.seats table for a specific event.
 *
 * @param {string|null} eventId - UUID of the active event
 * @param {Function} onSeatChange - Callback receives { eventType, new: seat, old: seat }
 */
export function useSeatsRealtime(eventId, onSeatChange) {
  useEffect(() => {
    if (!eventId) return

    const channel = supabase
      .channel(`seats_realtime_${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'seats',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          if (onSeatChange) {
            onSeatChange(payload)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('Realtime channel subscription error for seats')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [eventId, onSeatChange])
}
