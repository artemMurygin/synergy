import { useQuery } from '@tanstack/react-query'
import { NotificationsButton as BellButton, Popover, PopoverContent, PopoverTrigger } from '@synergy/ui-kit'
import { useState } from 'react'
import { unreadCountQuery } from '@/lib/backend/notifications.queries'
import type { Notification } from '@/lib/backend/notifications.schema'
import { NotificationsPopover } from './NotificationsPopover'
import { useOpenNotification } from './use-open-notification'

// Bell with the unread badge (frame tx6uv) and the list popover next to the rail (frame SJ0NJ)
export function NotificationsButton() {
  const [isOpen, setIsOpen] = useState(false)
  const unreadQuery = useQuery(unreadCountQuery())
  const openNotification = useOpenNotification()

  const handleOpenNotification = (notification: Notification) => {
    setIsOpen(false)
    openNotification(notification)
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <BellButton count={unreadQuery.data?.unreadCount ?? 0} open={isOpen} />
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={14}
        aria-label="Уведомления"
        className="w-auto min-w-0 overflow-hidden rounded-xl p-0"
      >
        <NotificationsPopover onOpenNotification={handleOpenNotification} onClose={() => { setIsOpen(false); }} />
      </PopoverContent>
    </Popover>
  )
}
