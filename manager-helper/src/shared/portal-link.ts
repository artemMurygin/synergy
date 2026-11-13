/** Builds the request page address of the configured portal; null when it cannot be done safely. */
export function buildRequestUrl(portalUrl: string | null, requestId: string): string | null {
  if (portalUrl === null) return null
  const base = portalUrl.trim().replace(/\/+$/, '')
  if (base === '' || requestId === '' || requestId === '.' || requestId === '..') return null
  let parsed: URL
  try {
    parsed = new URL(base)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const built = new URL(`${base}/requests/${encodeURIComponent(requestId)}`)
  return built.origin === parsed.origin ? built.href : null
}
