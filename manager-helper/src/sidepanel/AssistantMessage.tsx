import { MessagePrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { RUN_CONFLICT_MESSAGE, isRunConflict } from '@/shared/agent-client'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ErrorMessage } from './ErrorMessage'
import { RunningIndicator } from './RunningIndicator'
import { ToolCallGroup } from './ToolCallGroup'
import type { ToolCallView } from './ToolCallGroup'

/** The server did not answer (the browser could not reach it at all). */
function isUnreachable(error: string): boolean {
  return /failed to fetch|networkerror|load failed|network request failed/i.test(error)
}

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="markdown">
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  )
}

/** Answer of the agent: tool trace, markdown bubble and a note about how the run ended. */
export function AssistantMessage() {
  const aui = useAui()
  const content = useAuiState((s) => s.message.content)
  const status = useAuiState((s) => s.message.status)

  const running = status?.type === 'running'
  const toolCalls = content.flatMap((part): ToolCallView[] =>
    part.type === 'tool-call'
      ? [
          {
            id: part.toolCallId,
            name: part.toolName,
            args: part.args,
            status: running && part.result === undefined ? 'running' : 'complete',
          },
        ]
      : [],
  )
  const hasText = content.some((part) => part.type === 'text' && part.text.trim().length > 0)

  const failed = status?.type === 'incomplete' && status.reason === 'error'
  const stopped = status?.type === 'incomplete' && status.reason === 'cancelled'
  const rawError =
    failed && typeof status.error === 'string' ? status.error : 'Запуск агента завершился ошибкой.'
  const errorText = isRunConflict(rawError) ? RUN_CONFLICT_MESSAGE : rawError
  const retry = () => {
    aui.message.reload()
  }

  return (
    <MessagePrimitive.Root className="flex w-full flex-col gap-1.5">
      <ToolCallGroup
        toolCalls={toolCalls}
        status={running ? 'running' : stopped ? 'aborted' : 'complete'}
      />
      {hasText && (
        <div className="rounded-2xl bg-surface-alt px-3.5 py-2.5 text-sm leading-[1.4] break-words text-ink">
          <MessagePrimitive.Parts
            components={{ Text: ({ text }) => <MarkdownText text={text} /> }}
          />
        </div>
      )}
      {failed && (
        <ErrorMessage text={errorText} unreachable={isUnreachable(errorText)} onRetry={retry} />
      )}
      {stopped && <RunningIndicator variant="stopped" onRetry={retry} />}
    </MessagePrimitive.Root>
  )
}
