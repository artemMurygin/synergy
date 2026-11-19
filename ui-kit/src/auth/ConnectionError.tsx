import type { ReactNode } from 'react'
import { LogOut, RefreshCw, WifiOff } from '../icons'
import { Button } from '../primitives/Button'
import { AuthScreen } from './AuthScreen'

export type ConnectionErrorProps = {
  onRetry: () => void
  /** Идёт повторная попытка: кнопка «Повторяем…» заблокирована. */
  retrying?: boolean
  onLogout?: () => void
  footer?: ReactNode
}

/** Ошибка связи с сервером при сохранённой сессии (макет ZHyFP). */
export function ConnectionError({ onRetry, retrying, onLogout, footer }: ConnectionErrorProps) {
  return (
    <AuthScreen>
      <span className="flex size-16 items-center justify-center rounded-full bg-brand-red-soft text-brand-red">
        <WifiOff size={28} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[22px] leading-7 font-bold text-ink">Нет связи с сервером</h1>
        <p className="text-sm text-ink-60">Не удалось подключиться к бэкенду. Сессия сохранена, повторите попытку.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button disabled={retrying} onClick={onRetry} className="w-full rounded-full">
          <RefreshCw className={retrying ? 'animate-spin' : undefined} />
          {retrying ? 'Повторяем…' : 'Повторить'}
        </Button>
        {onLogout && !retrying ? (
          <Button variant="ghost" onClick={onLogout} className="h-12 w-full rounded-full">
            <LogOut />
            Выйти
          </Button>
        ) : null}
      </div>
      {footer ? <div className="text-[13px] text-ink-60">{footer}</div> : null}
    </AuthScreen>
  )
}
