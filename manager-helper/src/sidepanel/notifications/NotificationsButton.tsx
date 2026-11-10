import type { Ref } from 'react'
import { formatBadgeCount } from '@/shared/notifications/format-badge-count'
import { BellIcon } from '../icons'

interface Props {
  unreadCount: number
  isOpen: boolean
  onClick: () => void
  buttonRef?: Ref<HTMLButtonElement>
}

export function NotificationsButton({ unreadCount, isOpen, onClick, buttonRef }: Props) {
  const badge = formatBadgeCount(unreadCount)
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={
        badge === '' ? 'Уведомления' : `Уведомления: ${String(unreadCount)} непрочитанных`
      }
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      className={`relative flex size-9 shrink-0 items-center justify-center rounded-xl ${
        isOpen ? 'bg-surface-sunken text-ink' : 'text-ink-60 hover:bg-surface-alt'
      }`}
      onClick={onClick}
    >
      <BellIcon />
      {badge !== '' && (
        <span
          data-unread-badge
          aria-hidden="true"
          className={`absolute -top-[3px] left-[18px] rounded-full bg-brand-red px-[5px] py-px text-[10px] leading-3 font-bold text-white ring-2 ${
            isOpen ? 'ring-surface-sunken' : 'ring-white'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  )
}
