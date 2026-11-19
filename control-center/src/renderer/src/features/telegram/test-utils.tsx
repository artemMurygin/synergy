import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LayoutModeProvider } from '@synergy/ui-kit'
import type { ReactNode } from 'react'
import type { TelegramLinkStatus } from '@/lib/backend/telegram.schema'

export const TELEGRAM_LINK_URL = 'https://t.me/synergy_tasks_bot?start=abc_DEF'

export const unlinkedStatus: TelegramLinkStatus = { isAvailable: true, isLinked: false }

export const linkedStatus: TelegramLinkStatus = {
  isAvailable: true,
  isLinked: true,
  username: 'ivanov_tg',
  notificationsEnabled: true,
  linkedAt: new Date(2026, 10, 11, 14, 20).toISOString()
}

export const unavailableStatus: TelegramLinkStatus = { isAvailable: false, isLinked: false }

export function createTelegramWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>
      <LayoutModeProvider mode="desktop">{children}</LayoutModeProvider>
    </QueryClientProvider>
}
