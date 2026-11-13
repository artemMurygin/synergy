/**
 * Builds <portal>/requests/<encoded id>. Returns null when the portal address is unusable
 * or the identifier cannot form an address that stays inside the portal origin.
 */
export function buildPortalRequestUrl(portalUrl: string, requestId: string): string | null {
  if (requestId === '' || requestId === '.' || requestId === '..') return null
  let base: URL
  try {
    base = new URL(portalUrl)
  } catch {
    return null
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') return null
  const candidate = `${portalUrl.replace(/\/+$/, '')}/requests/${encodeURIComponent(requestId)}`
  try {
    return new URL(candidate).origin === base.origin ? candidate : null
  } catch {
    return null
  }
}
