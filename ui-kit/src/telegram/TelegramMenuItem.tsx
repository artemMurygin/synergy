import type { ComponentProps } from 'react'
import { ChevronRight, Send } from '../icons'
import { cn } from '../lib/cn'

export type TelegramMenuItemProps = Omit<ComponentProps<'button'>, 'children'> & {
  /** Статус рядом с названием: «Не подключён», «@username». */
  status?: string
}

/** Пункт «Telegram» меню профиля со статусом (макет bfjks). */
export function TelegramMenuItem({ status, className, type = 'button', ...props }: TelegramMenuItemProps) {
  return (
    <button
      type={type}
      className={cn(
        'flex h-11 w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 text-left text-sm font-medium text-ink outline-none hover:bg-surface-alt focus-visible:bg-surface-alt data-[highlighted]:bg-surface-alt',
        className,
      )}
      {...props}
    >
      <Send className="text-ink-80" />
      <span className="flex-1">Telegram</span>
      {status ? <span className="text-xs font-normal text-ink-60">{status}</span> : null}
      <ChevronRight size={16} className="text-ink-40" />
    </button>
  )
}
