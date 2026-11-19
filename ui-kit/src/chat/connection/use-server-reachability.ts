import { useCallback, useState } from 'react'
import { isNetworkError } from './is-network-error'

export type Connection = 'online' | 'offline'

export type ServerReachability = {
  connection: Connection
  /** Feed any error of a run or a request: a network one switches to `offline`. */
  reportError: (error: unknown) => void
  /** Asks the server through `probe`; success returns to `online`. */
  retry: () => Promise<void>
  retrying: boolean
}

/** Tracks whether the server is reachable; `probe` is the app's check (e.g. `GET /health`), it rejects or resolves `false` on failure. */
export function useServerReachability(probe: () => Promise<unknown>): ServerReachability {
  const [connection, setConnection] = useState<Connection>('online')
  const [retrying, setRetrying] = useState(false)

  const reportError = useCallback((error: unknown) => {
    if (isNetworkError(error)) setConnection('offline')
  }, [])

  const retry = useCallback(async () => {
    setRetrying(true)
    try {
      const ok = await probe()
      setConnection(ok === false ? 'offline' : 'online')
    } catch {
      setConnection('offline')
    } finally {
      setRetrying(false)
    }
  }, [probe])

  return { connection, reportError, retry, retrying }
}
