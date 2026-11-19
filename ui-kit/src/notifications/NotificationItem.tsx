import type { ReactNode } from 'react'
import { bellIconFallback } from './fallback-icon'
import { cn } from '../lib/cn'
import { toneClasses, type NotificationTone } from './tones'

export type NotificationView = {
  id: string
  title: string
  text: string
  /** Уже отформатированное время: «2 мин», «вчера». */
  time: string
  unread: boolean
  /** Подпись группы по дате («Сегодня», «Вчера», «Ранее»); при смене рисуется заголовок группы. */
  group?: string
  tone?: NotificationTone
  icon?: ReactNode
}

export type NotificationItemProps = {
  item: NotificationView
  onOpen: (item: NotificationView) => void
}

/** Строка уведомления (макет aXdYi): непрочитанные выделены фоном и точкой. */
export function NotificationItem({ item, onOpen }: NotificationItemProps) {
  return (
    <button
      type="button"
      onClick={() => {
        onOpen(item)
      }}
      className={cn(
        'flex w-full items-start gap-3 rounded-[16px] p-3 text-left outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-brand-red/40',
        item.unread ? 'bg-surface-alt' : 'bg-transparent',
      )}
    >
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', toneClasses[item.tone ?? 'brand'])}>
        {item.icon ?? bellIconFallback}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex items-center gap-2">
          <span className={cn('flex-1 truncate text-sm text-ink', item.unread ? 'font-bold' : 'font-semibold')}>{item.title}</span>
          <span className="shrink-0 text-xs font-medium text-ink-60">{item.time}</span>
          {item.unread ? <span aria-label="Непрочитано" className="size-2 shrink-0 rounded-full bg-brand-red" /> : null}
        </span>
        <span className={cn('line-clamp-2 text-[13px]', item.unread ? 'text-ink-80' : 'text-ink-60')}>{item.text}</span>
      </span>
    </button>
  )
}
