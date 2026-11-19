import { Unlink } from '../icons'
import { Button } from '../primitives/Button'

export type TelegramUnlinkConfirmProps = {
  username: string
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Подтверждение отключения Telegram (макет STkbU). */
export function TelegramUnlinkConfirm({ username, pending, onConfirm, onCancel }: TelegramUnlinkConfirmProps) {
  return (
    <section aria-label="Отключение Telegram" className="flex flex-col gap-4">
      <span className="flex size-12 items-center justify-center rounded-full bg-brand-red-soft text-brand-red">
        <Unlink size={22} />
      </span>
      <h2 className="font-display text-xl font-bold text-ink">Отключить Telegram?</h2>
      <p className="text-sm text-ink-60">
        Уведомления перестанут приходить в @{username}. Подключить Telegram снова можно в любой момент.
      </p>
      <div className="flex items-center gap-2 pt-2">
        <Button variant="secondary" disabled={pending} onClick={onCancel} className="h-11 rounded-[22px] border-transparent bg-surface-alt px-[18px] text-sm">
          Отмена
        </Button>
        <Button disabled={pending} onClick={onConfirm} className="h-11 rounded-[22px] px-[18px] text-sm shadow-none">
          {pending ? 'Отключаем…' : 'Отключить'}
        </Button>
      </div>
    </section>
  )
}
