import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, renderHook, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LayoutModeProvider } from '@synergy/ui-kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticatedSnapshot, installBridgeMock } from '@/features/auth/auth-test-utils'
import { useSessionStore } from '@/features/auth/session.store'
import { createTestQueryClient, installNotificationsBridgeMock } from '@/features/notifications/test-utils'
import * as notificationsApi from '@/lib/backend/notifications.api'
import * as telegramApi from '@/lib/backend/telegram.api'
import { unlinkedStatus } from '@/features/telegram/test-utils'
import { useUiStore } from '@/stores/ui.store'
import { NavRailFooter, useNavSections } from './NavRail'

vi.mock('@/lib/backend/notifications.api')
vi.mock('@/lib/backend/telegram.api')

afterEach(cleanup)

beforeEach(() => {
  installBridgeMock(authenticatedSnapshot)
  installNotificationsBridgeMock()
  vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ unreadCount: 3 })
  vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinkedStatus)
  useSessionStore.setState({ snapshot: authenticatedSnapshot })
  useUiStore.setState({ section: 'chats' })
})

function mountFooter() {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <LayoutModeProvider mode="desktop">
        <NavRailFooter />
      </LayoutModeProvider>
    </QueryClientProvider>
  )
  return userEvent.setup()
}

describe('NavRail', () => {
  it('lists the chats and tasks sections taken from the ui store', () => {
    const { result } = renderHook(() => useNavSections())
    expect(result.current.items.map((item) => item.label)).toEqual(['Чаты', 'Задачи'])
    expect(result.current.active).toBe('chats')
    act(() => { result.current.select('tasks'); })
    expect(useUiStore.getState().section).toBe('tasks')
  })

  it('has the notifications button with the unread count and the profile button, no theme switch', async () => {
    mountFooter()
    expect(await screen.findByRole('button', { name: 'Уведомления, непрочитанных: 3' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Профиль: admin' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /тема/i })).toBeNull()
  })
})
