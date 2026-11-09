import { MessagePrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { CircleAlert, Info, Square } from 'lucide-react'
import { RunNotice } from './RunNotice'
import { isRunConflict, isUnreachable, UNREACHABLE_MESSAGE } from './run-errors'

const FAILED_TEXT = 'Запуск агента завершился ошибкой.'

/** Answer of the agent: text bubble and a note about how the run ended. */
export function AssistantMessage() {
  const aui = useAui()
  const content = useAuiState((s) => s.message.content)
  const status = useAuiState((s) => s.message.status)

  const hasText = content.some((part) => part.type === 'text' && part.text.trim().length > 0)
  const failed = status?.type === 'incomplete' && status.reason === 'error'
  const stopped = status?.type === 'incomplete' && status.reason === 'cancelled'
  const raw = failed && typeof status.error === 'string' ? status.error : FAILED_TEXT
  const retry = () => {
    aui.message.reload()
  }

  return (
    <MessagePrimitive.Root className="flex w-full flex-col gap-1.5">
      {hasText && (
        <div className="max-w-[85%] self-start rounded-2xl bg-muted px-3.5 py-2.5 text-sm leading-[1.4] break-words whitespace-pre-wrap text-foreground">
          <MessagePrimitive.Parts />
        </div>
      )}
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
