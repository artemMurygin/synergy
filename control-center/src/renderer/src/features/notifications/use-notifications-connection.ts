import type { NotificationsConnection } from '@synergy/ui-kit'
import { useEffect, useState } from 'react'
import type { NotificationConnectionState } from '../../../../preload/notifications-bridge'

const toConnection = (state: NotificationConnectionState): NotificationsConnection =>
  state === 'online' ? 'online' : 'reconnecting'

/** State of the notifications socket for the list: the main process reports it over the IPC bridge. */
export function useNotificationsConnection(): NotificationsConnection {
  const [connection, setConnection] = useState<NotificationsConnection>('online')

  useEffect(() => {
    const bridge = window.api.notifications
    let active = true
    const unsubscribe = bridge.onConnectionState((state) => {
      setConnection(toConnection(state))
    })
    bridge.getConnectionState().then(
      (state) => {
        if (active) setConnection(toConnection(state))
      },
      () => undefined
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return connection
}
