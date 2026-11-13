const DEFAULT_BACKEND_URL = 'http://localhost:3000'

// Backend base URL from CC_BACKEND_URL, without trailing slashes
export function getBackendUrl(): string {
  const raw = process.env['CC_BACKEND_URL']?.trim() || DEFAULT_BACKEND_URL
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`CC_BACKEND_URL is not a valid URL: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`CC_BACKEND_URL must use http or https: ${raw}`)
  }
  return raw.replace(/\/+$/, '')
}

// Featurer portal base URL from CC_PORTAL_URL, without trailing slashes; null when unset or unusable
export function getPortalUrl(): string | null {
  const raw = process.env['CC_PORTAL_URL']?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  } catch {
    return null
  }
  return raw.replace(/\/+$/, '')
}
