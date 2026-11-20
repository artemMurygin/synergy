import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatSearchQuery } from './chat-search-context'
import { rehypeSearchMarks } from './rehype-search-marks'

const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
}

/** Agent answer as GitHub-flavoured markdown; raw HTML is not rendered. Occurrences of the chat search are marked. */
export function MarkdownText({ text }: { text: string }) {
  const query = useChatSearchQuery()
  return (
    <div className="markdown">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSearchMarks, { query }]]} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  )
}
