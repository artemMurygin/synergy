import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
}

/** Agent answer as GitHub-flavoured markdown; raw HTML is not rendered. */
export function MarkdownText({ text }: { text: string }) {
  return (
    <div className="markdown">
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  )
}
