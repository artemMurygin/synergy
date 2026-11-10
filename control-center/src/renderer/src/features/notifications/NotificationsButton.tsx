import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { unreadCountQuery } from '@/lib/backend/notifications.queries'
import type { Notification } from '@/lib/backend/notifications.schema'
import { cn } from '@/lib/utils'
import { NotificationsPopover } from './NotificationsPopover'
import { UnreadBadge } from './UnreadBadge'
import { useOpenNotification } from './use-open-notification'

const LABEL = 'Уведомления'

export function NotificationsButton() {
  const [isOpen, setIsOpen] = useState(false)
  const unreadQuery = useQuery(unreadCountQuery())
  const openNotification = useOpenNotification()

  const handleOpenNotification = (notification: Notification) => {
    setIsOpen(false)
    openNotification(notification)
  }

  return (
    <div className="group/bell relative flex">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger
          aria-label={LABEL}
          className={cn(
            'relative flex size-9 items-center justify-center rounded-xl text-muted-foreground outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-ring',
            isOpen && 'bg-surface-sunken'
          )}
        >
          <Bell aria-hidden className="size-4" />
          <UnreadBadge count={unreadQuery.data?.unreadCount ?? 0} className="absolute -top-[3px] left-[18px]" />
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="end"
          sideOffset={22}
          aria-label={LABEL}
          className="w-auto min-w-0 rounded-lg shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
        >
          <NotificationsPopover onOpenNotification={handleOpenNotification} />
        </PopoverContent>
      </Popover>
      <span
        role="tooltip"
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1/2 left-[56px] z-50 -translate-y-1/2 rounded-sm bg-ink px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-white opacity-0 transition-opacity',
          !isOpen && 'group-hover/bell:opacity-100 group-has-[:focus-visible]/bell:opacity-100'
        )}
      >
        {LABEL}
      </span>
    </div>
  )
}
