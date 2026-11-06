import { AlertCircleIcon } from '@/sidepanel/icons'
import { RunNotice } from '@/sidepanel/RunNotice'
import { ServerLine } from './ServerLine'

interface Props {
  onRetry: () => void
  serverUrl: string
  onChangeServer: () => void
}

export function ConnectionError({ onRetry, serverUrl, onChangeServer }: Props) {
  return (
    <div className="flex min-h-screen flex-col justify-center gap-6 bg-white p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-[26px] font-bold text-ink">Manager Helper</h1>
        <p className="text-sm text-ink-60">Не удалось связаться с сервером</p>
      </header>
      <RunNotice
        tone="error"
        role="alert"
        icon={<AlertCircleIcon />}
        title="Нет связи с сервером"
        text="Сессия не потеряна. Проверьте подключение и повторите попытку."
        actionLabel="Повторить"
        onAction={onRetry}
      />
      <ServerLine serverUrl={serverUrl} onChangeServer={onChangeServer} />
    </div>
  )
}
