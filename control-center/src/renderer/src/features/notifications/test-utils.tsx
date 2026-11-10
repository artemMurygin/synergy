import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import type { Notification } from '@/lib/backend/notifications.schema'
import type {
  NotificationConnectionState,
  NotificationEventView,
  NotificationsBridge
} from '../../../../preload/notifications-bridge'

export const makeNotification = (id: string, readAt: string | null = null): Notification => ({
  id,
  type: 'task.assigned',
  title: `Уведомление ${id}`,
  body: 'Текст',
  target: { type: 'task', id: `task-${id}` },
  actorId: null,
  createdAt: '2026-11-10T10:00:00.000Z',
  readAt
})

export function installNotificationsBridgeMock(initialState: NotificationConnectionState = 'online') {
  const eventListeners = new Set<(event: NotificationEventView) => void>()
  const stateListeners = new Set<(state: NotificationConnectionState) => void>()
  const bridge: NotificationsBridge = {
    onEvent: (listener) => {
      eventListeners.add(listener)
      return () => {
        eventListeners.delete(listener)
      }
    },
    onConnectionState: (listener) => {
      stateListeners.add(listener)
      return () => {
        stateListeners.delete(listener)
      }
    },
    getConnectionState: vi.fn<NotificationsBridge['getConnectionState']>().mockResolvedValue(initialState)
  }
  const current: unknown = Reflect.get(window, 'api')
  const base = typeof current === 'object' && current !== null ? current : {}
  Object.defineProperty(window, 'api', { value: { ...base, notifications: bridge }, configurable: true, writable: true })
  return {
    bridge,
    emitEvent: (event: NotificationEventView) => eventListeners.forEach((listener) => listener(event)),
    emitState: (state: NotificationConnectionState) => stateListeners.forEach((listener) => listener(state)),
    listenerCount: () => eventListeners.size + stateListeners.size
  }
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

export function createWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
