import { ApiError } from '@/lib/errors'

export interface RefreshCoordinatorOptions {
  /** Obtains a new access token and stores it. */
  refresh: () => Promise<void>
  /** Called when the session cannot be continued (refresh rejected, retry still 401). */
  onSessionLost: () => void
}

function isExpired(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'unauthorized' && error.code === 'TOKEN_EXPIRED'
}

/** One shared refresh for parallel requests and one retry per request. */
export function createRefreshCoordinator({ refresh, onSessionLost }: RefreshCoordinatorOptions) {
  let inFlight: Promise<void> | null = null

  function sharedRefresh(): Promise<void> {
    inFlight ??= refresh().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (!isExpired(error)) throw error
    }
    try {
      await sharedRefresh()
    } catch (error) {
      // an unreachable server does not prove the session is gone
      if (!(error instanceof ApiError && error.kind === 'unavailable')) onSessionLost()
      throw error
    }
    try {
      return await fn()
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'unauthorized') onSessionLost()
      throw error
    }
  }

  return { run, refresh: sharedRefresh }
}

export type RefreshCoordinator = ReturnType<typeof createRefreshCoordinator>
