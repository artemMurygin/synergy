import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from './use-chat'

function formatArgs(args: unknown): string {
  const text = JSON.stringify(args)
  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}

export function Message({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="ml-8 self-end rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm text-white">
        {message.text}
      </div>
    )
  }

  if (message.role === 'error') {
    return (
      <div className="mr-8 rounded-2xl rounded-bl-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {message.text}
      </div>
    )
  }

  return (
    <div className="mr-4 flex flex-col gap-1">
      <div className="markdown rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 text-sm text-gray-900">
        <Markdown remarkPlugins={[remarkGfm]}>{message.text}</Markdown>
      </div>
      <details className="px-1 text-xs text-gray-500">
        <summary className="cursor-pointer select-none">
          {(message.durationMs / 1000).toFixed(1)} с · вызовов инструментов:{' '}
          {message.toolCalls.length}
        </summary>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          {message.toolCalls.map((call, index) => (
            <li key={`${String(index)}-${call.name}`} className="break-all">
              <span className="font-medium text-gray-700">{call.name}</span> {formatArgs(call.args)}
            </li>
          ))}
        </ol>
      </details>
    </div>
  )
}
