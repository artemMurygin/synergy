import { RunNotice } from './RunNotice'
import { AlertCircleIcon } from './icons'

interface Props {
  text: string
  /** The server did not answer or the backend address is not configured. */
  unreachable?: boolean
  onRetry: () => void
}

const SETTINGS_HINT = 'Проверьте адрес бэкенда в настройках расширения.'

export function ErrorMessage({ text, unreachable = false, onRetry }: Props) {
  return (
    <RunNotice
      tone="error"
      role="alert"
      icon={<AlertCircleIcon />}
      title="Не удалось получить ответ"
      text={unreachable ? `${text} ${SETTINGS_HINT}` : text}
      actionLabel="Повторить"
      onAction={onRetry}
    />
  )
}
