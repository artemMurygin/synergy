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

export async function setBackendUrl(url: string): Promise<void> {
  await chrome.storage.sync.set({ [BACKEND_URL_KEY]: normalizeBackendUrl(url) })
}
