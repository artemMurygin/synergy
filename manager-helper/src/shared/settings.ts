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

/** Remote hosts must use https; cleartext http is allowed for localhost only. */
async function ensureHostPermission(url: string): Promise<boolean> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (LOCAL_HOSTS.has(parsed.hostname)) return true
  if (parsed.protocol !== 'https:') return false
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
