import { MessagePrimitive, useAuiState } from '@assistant-ui/react'
import { Bell } from '../icons'
import { MessageAttachments } from './attachments/MessageAttachments'
import { messageFiles, messageSource } from './attachments/message-files'
import { cn } from '../lib/cn'
import { MarkdownText } from './MarkdownText'
import { RunNotice } from './RunNotice'
import { useThreadActions } from './thread-context'
import { ToolFallback, ToolGroupParts } from './ToolGroup'

export const FAILED_TEXT = 'Запуск агента завершился ошибкой.'
export const SYSTEM_MESSAGE_LABEL = 'Сообщение о расшифровке'

function errorText(error: unknown): string {
  if (typeof error === 'string' && error !== '') return error
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' && error.message !== '') {
    return error.message
  }
  return FAILED_TEXT
}

/**
 * Answer of the agent: group of tool calls, text bubble, files and a note on how the run ended.
 * A system message (posted by the server on an event) carries a label instead of the run notes.
 */
export function AssistantMessage() {
  const message = useAuiState((s) => s.message)
  const { onRetry, onDownload, pendingDownloads, editingMessageId } = useThreadActions()
  const replaced = editingMessageId != null && message.parentId === editingMessageId
  const { status } = message
  const system = messageSource(message) === 'system'
  const failed = !system && status?.type === 'incomplete' && status.reason === 'error'
  const stopped = !system && status?.type === 'incomplete' && status.reason === 'cancelled'

  return (
    <MessagePrimitive.Root className={cn('flex w-full flex-col gap-1.5', replaced && 'opacity-40')}>
      {replaced && <span className="self-start font-chat text-xs text-ink-60">Будет заменён</span>}
      {system && (
        <span className="flex items-center gap-1.5 self-start font-chat text-xs text-ink-60">
          <Bell size={14} />
          {SYSTEM_MESSAGE_LABEL}
        </span>
      )}
      <MessagePrimitive.Parts
        components={{
          Text: ({ text }) =>
            text.trim().length > 0 ? (
              <div className="max-w-[85%] self-start rounded-2xl bg-surface-alt px-[18px] py-3 font-chat text-sm leading-[1.4] break-words text-ink">
                <MarkdownText text={text} />
              </div>
            ) : null,
          ToolGroup: ToolGroupParts,
          tools: { Fallback: ToolFallback },
        }}
      />
      <MessageAttachments
        files={messageFiles(message)}
        pending={pendingDownloads}
        onDownload={onDownload ?? (() => undefined)}
      />
      {failed && <RunNotice kind="error" text={errorText(status.error)} onRetry={onRetry} />}
      {stopped && <RunNotice kind="stopped" onRetry={onRetry} />}
    </MessagePrimitive.Root>
  )
}
