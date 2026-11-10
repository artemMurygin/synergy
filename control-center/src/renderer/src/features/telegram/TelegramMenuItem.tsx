import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Send } from 'lucide-react'
import { telegramLinkQuery } from '@/lib/backend/telegram.queries'
import type { TelegramLinkStatus } from '@/lib/backend/telegram.schema'
import { formatTelegramUsername } from './telegram-format'

interface TelegramMenuItemProps {
  onOpen: () => void
}

const statusCaption = (status: TelegramLinkStatus): string =>
  status.isLinked ? (formatTelegramUsername(status.username) ?? 'Подключён') : 'Не подключён'

export function TelegramMenuItem({ onOpen }: TelegramMenuItemProps) {
  const { data: status } = useQuery(telegramLinkQuery())
  if (status === undefined || !status.isAvailable) return null

  return (
    <>
      <div aria-hidden className="h-px bg-border" />
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-md p-2 text-left outline-none hover:bg-surface-alt focus-visible:bg-surface-alt focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
          <Send aria-hidden className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] leading-[15px] font-semibold text-ink">Telegram</span>
          <span className="truncate text-xs leading-[14px] text-ink-60">{statusCaption(status)}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-40" />
      </button>
    </>
  )
}
