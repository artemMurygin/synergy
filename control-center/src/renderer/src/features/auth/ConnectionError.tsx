import { WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ConnectionErrorProps {
  onRetry: () => void
}

export function ConnectionError({ onRetry }: ConnectionErrorProps) {
  return (
    <div className="flex min-h-full w-full items-center justify-center bg-surface-alt p-8">
      <div className="flex w-full max-w-[460px] flex-col items-center gap-6 rounded-lg border bg-surface p-[39px] text-center">
        <WifiOff aria-hidden className="size-8 text-brand-red" />
        <div className="flex w-full flex-col gap-2">
          <h1 className="font-display text-[22px] leading-7 font-bold text-ink">Нет связи с сервером</h1>
          <p className="text-sm leading-[1.4] text-ink-60">
            Не удалось подключиться к бэкенду. Сессия сохранена, повторите попытку.
          </p>
        </div>
        <Button
          type="button"
          onClick={onRetry}
          className="h-12 w-full rounded-lg px-6 text-[15px] font-semibold shadow-[0_8px_4px_rgba(102,0,0,0.2)]"
        >
          Повторить
        </Button>
      </div>
    </div>
  )
}
