/** A failure of the transport: the server was not reached (`TypeError: Failed to fetch`, Electron `net::ERR_*`). */
export function isNetworkError(error: unknown): boolean {
  if (typeof error === 'string') return error.includes('net::ERR_')
  if (!(error instanceof Error)) return false
  if (error.message.includes('net::ERR_')) return true
  return error instanceof TypeError && error.message === 'Failed to fetch'
}
