import type { ReactNode } from 'react'
import { Loader } from '../icons'
import { AuthScreen } from './AuthScreen'

/** Загрузка при старте: проверка сохранённого входа (макет Pd6db). */
export function RestoringScreen({ footer }: { footer?: ReactNode }) {
  return (
    <AuthScreen>
      <div role="status" className="flex flex-col gap-6">
        <span className="flex size-16 items-center justify-center rounded-full bg-brand-red-soft text-brand-red">
          <Loader size={28} className="animate-spin" />
        </span>
        <div className="flex flex-col gap-2">
          <p className="font-display text-[22px] leading-7 font-bold text-ink">Восстанавливаем сессию</p>
          <p className="text-sm text-ink-60">Проверяем сохранённый вход.</p>
        </div>
      </div>
      {footer ? <div className="text-[13px] text-ink-60">{footer}</div> : null}
    </AuthScreen>
  )
}
