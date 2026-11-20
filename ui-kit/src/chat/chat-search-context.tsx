import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { MATCH_ATTRIBUTE, normalizeQuery } from './chat-search'

/** The query to highlight in the messages of the feed; empty while the search is closed. */
export const ChatSearchQueryContext = createContext('')

export function useChatSearchQuery(): string {
  return useContext(ChatSearchQueryContext)
}

const subscribeNothing = () => () => undefined

export type ChatSearchState = {
  query: string
  setQuery: (query: string) => void
  /** Number of the current match from 1; 0 without matches. */
  current: number
  total: number
  next: () => void
  prev: () => void
  reset: () => void
}

/**
 * State of the search in the loaded messages: the matches are the `<mark>` elements rendered by the feed,
 * so the counter and the jumps always agree with what the user sees. The current one is marked and scrolled to.
 */
export function useChatSearch(open: boolean, scope: RefObject<HTMLElement | null>): ChatSearchState {
  const [rawQuery, setRawQuery] = useState('')
  const [index, setIndex] = useState(0)
  const scrolledTo = useRef('')
  const query = open ? rawQuery : ''
  const active = normalizeQuery(query) !== ''

  const matches = () => (active && scope.current !== null ? Array.from(scope.current.querySelectorAll(`mark[${MATCH_ATTRIBUTE}]`)) : [])
  // The marks are rendered by the feed: the count is read from the DOM after each commit
  const total = useSyncExternalStore(subscribeNothing, () => matches().length)

  useEffect(() => {
    const marks = matches()
    const at = Math.min(index, marks.length - 1)
    marks.forEach((element, position) => {
      element.toggleAttribute('data-current', position === at)
    })
    const key = `${query}|${String(at)}`
    const target = marks[at]
    if (target !== undefined && scrolledTo.current !== key) target.scrollIntoView({ block: 'center' })
    scrolledTo.current = target === undefined ? '' : key
  })

  const shown = total === 0 ? 0 : Math.min(index, total - 1) + 1
  return {
    query,
    setQuery: (value) => {
      setRawQuery(value)
      setIndex(0)
    },
    current: shown,
    total,
    next: () => {
      if (total > 0) setIndex((shown % total))
    },
    prev: () => {
      if (total > 0) setIndex((shown - 2 + total) % total)
    },
    reset: () => {
      setRawQuery('')
      setIndex(0)
    },
  }
}
