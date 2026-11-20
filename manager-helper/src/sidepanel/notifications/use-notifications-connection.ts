import { useState } from 'react'
import type { NotificationsConnection } from '@synergy/ui-kit'
import type { ConnectionState } from '@/shared/notifications/panel-protocol'

/**
 * Banner state of the list from the background socket state. `connecting` keeps the previous
 * value: the first connection of an opened panel is not a loss of the link, a retry after one is.
 */
export function useNotificationsConnection(state: ConnectionState): NotificationsConnection {
  const [connection, setConnection] = useState<NotificationsConnection>(
    state === 'offline' ? 'reconnecting' : 'online',
  )
  if (state === 'online' && connection !== 'online') setConnection('online')
  if (state === 'offline' && connection !== 'reconnecting') setConnection('reconnecting')
  return state === 'online' ? 'online' : state === 'offline' ? 'reconnecting' : connection
}
