import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Links leave the app: main opens target=_blank in the system browser (setWindowOpenHandler)
const COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />
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
