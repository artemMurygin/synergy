const ACTIVE_SECTION_KEY = 'activeSection'

export type Section = 'chat' | 'tasks'

export const DEFAULT_SECTION: Section = 'chat'

/** Section the panel showed last; falls back to the chat. */
export async function getActiveSection(): Promise<Section> {
  try {
    const stored = await chrome.storage.local.get(ACTIVE_SECTION_KEY)
    const value: unknown = stored[ACTIVE_SECTION_KEY]
    return value === 'tasks' || value === 'chat' ? value : DEFAULT_SECTION
  } catch {
    return DEFAULT_SECTION
  }
}

export async function setActiveSection(section: Section): Promise<void> {
  try {
    await chrome.storage.local.set({ [ACTIVE_SECTION_KEY]: section })
  } catch {
    // storage is unavailable; the panel just will not restore the section next time
  }
}
