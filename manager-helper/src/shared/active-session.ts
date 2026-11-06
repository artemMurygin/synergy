const ACTIVE_SESSION_KEY = 'activeChatSessionId'

/** Id of the chat the panel showed last; the server stays the source of truth for everything else. */
export async function getActiveSessionId(): Promise<string | null> {
  try {
    const stored = await chrome.storage.local.get(ACTIVE_SESSION_KEY)
    const value: unknown = stored[ACTIVE_SESSION_KEY]
    return typeof value === 'string' && value.length > 0 ? value : null
  } catch {
    return null
  }
}

export async function setActiveSessionId(id: string | null): Promise<void> {
  try {
    if (id === null) await chrome.storage.local.remove(ACTIVE_SESSION_KEY)
    else await chrome.storage.local.set({ [ACTIVE_SESSION_KEY]: id })
  } catch {
    // storage is unavailable; the panel just will not restore the chat next time
  }
}
