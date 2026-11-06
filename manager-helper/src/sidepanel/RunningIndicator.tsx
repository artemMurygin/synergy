import { RunNotice } from './RunNotice'
import { LoaderIcon, SquareIcon } from './icons'

interface Props {
  /** `running`: returned to a run in progress; `stopped`: the run was cancelled. */
  variant: 'running' | 'stopped'
  /** Re-asks the question of the stopped answer. */
  onRetry?: () => void
}

export function RunningIndicator({ variant, onRetry }: Props) {
  if (variant === 'stopped') {
    return (
      <RunNotice
        tone="neutral"
        role="status"
        icon={<SquareIcon />}
        title="Ответ остановлен"
        text="Показана полученная часть. В историю чата она не сохранена."
        actionLabel="Повторить вопрос"
        onAction={onRetry}
      />
    )
  }
  return (
    <RunNotice
      tone="info"
      role="status"
      icon={<LoaderIcon />}
      title="Агент ещё отвечает"
      text="Ответ появится в чате, когда будет готов. Панель можно закрыть."
    />
  )
}
