import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Hook to subscribe to realtime changes on the public.show_seats table for a specific show.
 *
 * @param {string|null} showId - UUID of the active show
 * @param {Function} onSeatChange - Callback receives { eventType, new: seat, old: seat }
 */
export function useSeatsRealtime(showId, onSeatChange) {
  useEffect(() => {
    if (!showId) return

    const channel = supabase
      .channel(`show_seats_realtime_${showId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'show_seats',
          filter: `show_id=eq.${showId}`,
        },
        (payload) => {
          if (onSeatChange) {
            onSeatChange(payload)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('Realtime channel subscription error for show_seats')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [showId, onSeatChange])
}
