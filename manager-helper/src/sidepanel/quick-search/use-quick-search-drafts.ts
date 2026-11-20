import { useCallback, useRef, useState } from 'react'
import { DEFAULT_QUICK_SEARCH } from './defaults'
import type { QuickSearchValues } from './defaults'

/** Key of the panel without a chat: its draft is its own. */
const NO_CHAT = ''

/** Drafts of the quick search form per chat, in memory: back in the chat restores it, another chat starts from the defaults. */
export function useQuickSearchDrafts(): [
  draftOf: (threadId: string | null) => QuickSearchValues,
  setDraft: (threadId: string | null, form: QuickSearchValues) => void,
] {
  const drafts = useRef(new Map<string, QuickSearchValues>())
  const [, setVersion] = useState(0)

  const draftOf = useCallback(
    (threadId: string | null) => drafts.current.get(threadId ?? NO_CHAT) ?? DEFAULT_QUICK_SEARCH,
    [],
  )
  const setDraft = useCallback((threadId: string | null, form: QuickSearchValues) => {
    drafts.current.set(threadId ?? NO_CHAT, form)
    setVersion((v) => v + 1)
  }, [])
  return [draftOf, setDraft]
}
