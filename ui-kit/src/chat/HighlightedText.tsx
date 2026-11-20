import { MATCH_ATTRIBUTE, MATCH_CLASS, splitByQuery } from './chat-search'
import { useChatSearchQuery } from './chat-search-context'

/** Text part of a message with the occurrences of the search query marked (`components.Text` of `MessagePrimitive.Parts`). */
export function HighlightedText({ text }: { text: string }) {
  const query = useChatSearchQuery()
  return (
    <p>
      {splitByQuery(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} {...{ [MATCH_ATTRIBUTE]: '' }} className={MATCH_CLASS}>
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </p>
  )
}
