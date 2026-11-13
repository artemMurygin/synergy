import { endSession } from './auth/session-channel'

export const DEFAULT_BACKEND_URL = 'http://localhost:3000'

const BACKEND_URL_KEY = 'backendUrl'

export function normalizeBackendUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

export async function getBackendUrl(): Promise<string> {
  const stored = await chrome.storage.sync.get(BACKEND_URL_KEY)
  const value: unknown = stored[BACKEND_URL_KEY]
  return typeof value === 'string' && value.length > 0 ? value : DEFAULT_BACKEND_URL
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/** Requests host access for the address; both http and https are allowed. */
async function ensureHostPermission(url: string): Promise<boolean> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (LOCAL_HOSTS.has(parsed.hostname)) return true
  return chrome.permissions.request({ origins: [`${parsed.origin}/*`] })
}

/** Saves the address; false if the user denied access to the new host. A changed address ends the session. */
export async function setBackendUrl(url: string): Promise<boolean> {
  const next = normalizeBackendUrl(url)
  if (!(await ensureHostPermission(next))) return false
  const changed = next !== (await getBackendUrl())
  await chrome.storage.sync.set({ [BACKEND_URL_KEY]: next })
  if (changed) endSession()
  return true
}

const PORTAL_URL_KEY = 'portalUrl'

/** The portal address, or null when it is not configured. */
export async function getPortalUrl(): Promise<string | null> {
  const stored = await chrome.storage.sync.get(PORTAL_URL_KEY)
  const value: unknown = stored[PORTAL_URL_KEY]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Saves the portal address (empty clears it); false for an address that is not http(s). Needs no host permission: the portal is opened in a tab. */
export async function setPortalUrl(url: string): Promise<boolean> {
  const next = normalizeBackendUrl(url)
  if (next !== '') {
    try {
      const { protocol } = new URL(next)
      if (protocol !== 'http:' && protocol !== 'https:') return false
    } catch {
      return false
    }
  }
  await chrome.storage.sync.set({ [PORTAL_URL_KEY]: next })
  return true
}
