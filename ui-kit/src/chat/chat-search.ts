/** Query of the search: surrounding spaces are not part of it; blank means no search. */
export function normalizeQuery(query: string): string {
  return query.trim()
}

export type TextPart = { text: string; match: boolean }

/** Splits the text by the occurrences of the query (without the case, the query is literal); parts keep the original text. */
export function splitByQuery(text: string, query: string): TextPart[] {
  const needle = normalizeQuery(query).toLowerCase()
  if (needle === '') return [{ text, match: false }]
  const haystack = text.toLowerCase()
  const parts: TextPart[] = []
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) break
    if (at > from) parts.push({ text: text.slice(from, at), match: false })
    parts.push({ text: text.slice(at, at + needle.length), match: true })
    from = at + needle.length
  }
  if (from < text.length || parts.length === 0) parts.push({ text: text.slice(from), match: false })
  return parts
}

export function countMatches(text: string, query: string): number {
  return splitByQuery(text, query).filter((part) => part.match).length
}

/** Classes of a found fragment; the current one is marked with `data-current`. */
export const MATCH_CLASS = 'rounded-[4px] bg-warning-soft px-0.5 text-ink data-[current]:bg-warning'
export const MATCH_ATTRIBUTE = 'data-chat-match'
