import { MessagePrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { Bell, CircleAlert, Info, Square } from 'lucide-react'
import { MarkdownText } from './MarkdownText'
import { MessageAttachments } from './MessageAttachments'
import { messageFiles, messageSource } from './message-files'
import { RunNotice } from './RunNotice'
import { isRunConflict, isUnreachable, UNREACHABLE_MESSAGE } from './run-errors'

const FAILED_TEXT = 'Запуск агента завершился ошибкой.'
export const SYSTEM_MESSAGE_LABEL = 'Сообщение о расшифровке'

/**
 * Answer of the agent: text bubble, its files and a note about how the run ended.
 * A system message (posted by the server on an event) carries a label instead of the run notes.
 */
export function AssistantMessage() {
  const aui = useAui()
  const message = useAuiState((s) => s.message)
  const { content, status } = message
  const files = messageFiles(message)
  const system = messageSource(message) === 'system'

  const hasText = content.some((part) => part.type === 'text' && part.text.trim().length > 0)
  const failed = !system && status?.type === 'incomplete' && status.reason === 'error'
  const stopped = !system && status?.type === 'incomplete' && status.reason === 'cancelled'
  const raw = failed && typeof status.error === 'string' ? status.error : FAILED_TEXT
  const retry = () => {
    aui.message.reload()
  }

  return (
    <MessagePrimitive.Root className="flex w-full flex-col gap-1.5">
      {system && (
        <span className="flex items-center gap-1.5 self-start text-xs text-ink-60">
          <Bell aria-hidden className="size-3.5" />
          {SYSTEM_MESSAGE_LABEL}
        </span>
      )}
      {hasText && (
        <div className="max-w-[85%] self-start rounded-2xl bg-surface-alt px-3.5 py-2.5 text-sm leading-[1.5] break-words text-ink">
          <MessagePrimitive.Parts components={{ Text: ({ text }) => <MarkdownText text={text} /> }} />
        </div>
      )}
      <MessageAttachments files={files} />
      {failed && isRunConflict(raw) && (
        <RunNotice
          tone="info"
          role="status"
          icon={<Info className="size-4" />}
          title="Агент ещё отвечает"
          text="Дождитесь ответа или остановите его."
        />
      )}
      {failed && !isRunConflict(raw) && (
        <RunNotice
          tone="error"
          role="alert"
          icon={<CircleAlert className="size-4" />}
          title="Не удалось получить ответ"
          text={isUnreachable(raw) ? UNREACHABLE_MESSAGE : raw}
          actionLabel="Повторить"
          onAction={retry}
        />
      )}
      {stopped && (
        <RunNotice
          tone="neutral"
          role="status"
          icon={<Square className="size-4" />}
          title="Ответ остановлен"
          text="Показана полученная часть. В историю чата она не сохранена."
          actionLabel="Повторить вопрос"
          onAction={retry}
        />
      )}
    </MessagePrimitive.Root>
  )
}
