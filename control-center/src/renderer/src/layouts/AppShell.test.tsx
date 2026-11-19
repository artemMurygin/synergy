/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unnecessary-type-assertion -- test doubles: mocks, DOM stubs and fake transports of the test environment are typed loosely on purpose */
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticatedSnapshot } from '@/features/auth/auth-test-utils'
import { useSessionStore } from '@/features/auth/session.store'
import {
  createTestQueryClient,
  installNotificationsBridgeMock,
  makeNotification
} from '@/features/notifications/test-utils'
import * as notificationsApi from '@/lib/backend/notifications.api'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useUiStore } from '@/stores/ui.store'
import { LayoutModeProvider } from '@synergy/ui-kit'
import { AppShell } from './AppShell'

vi.mock('@/lib/backend/notifications.api')

afterEach(() => {
  cleanup()
  useNotificationsStore.getState().reset()
})

let notificationsBridge: ReturnType<typeof installNotificationsBridgeMock>

beforeEach(() => {
  notificationsBridge = installNotificationsBridgeMock()
  vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ unreadCount: 0 })
  useUiStore.setState({ section: 'chats' })
  useSessionStore.setState({ snapshot: authenticatedSnapshot })
})

function Draft({ label }: { label: string }) {
  const [text, setText] = useState('')
  return <input aria-label={label} value={text} onChange={(e) => { setText(e.target.value); }} />
}

function mount(tasks: () => void = () => {}) {
  function Tasks() {
    tasks()
    return <Draft label="Фильтр задач" />
  }
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <LayoutModeProvider mode="desktop">
        <AppShell chats={<Draft label="Сообщение" />} tasks={<Tasks />} />
      </LayoutModeProvider>
    </QueryClientProvider>
  )
  return userEvent.setup()
}

describe('AppShell', () => {
  it('shows the rail with both sections and marks chats as current', () => {
    mount()
    const nav = screen.getByRole('navigation')
    expect(nav).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Чаты' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Задачи' }).getAttribute('aria-current')).toBeNull()
  })

  it('does not mount the tasks section until it is opened', () => {
    const onRender = vi.fn()
    mount(onRender)
    expect(onRender).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Фильтр задач')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Задачи', hidden: true })).toBeNull()
  })

  it('switches to tasks through the rail and hides the chats section', async () => {
    const user = mount()
    await user.click(screen.getByRole('button', { name: 'Задачи' }))
    expect(useUiStore.getState().section).toBe('tasks')
    expect(screen.getByRole('button', { name: 'Задачи' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByLabelText('Фильтр задач')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Чаты' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Задачи' })).toBeTruthy()
  })

  it('keeps the hidden section mounted and restores its state on return', async () => {
    const user = mount()
    await user.type(screen.getByLabelText('Сообщение'), 'черновик')
    await user.click(screen.getByRole('button', { name: 'Задачи' }))
    await user.type(screen.getByLabelText('Фильтр задач'), 'отчёт')
    // hidden but still in the DOM
    expect(screen.getByLabelText('Сообщение', { selector: 'input' }).closest('[hidden]')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Чаты' }))
    expect((screen.getByLabelText('Сообщение') as HTMLInputElement).value).toBe('черновик')
    await user.click(screen.getByRole('button', { name: 'Задачи' }))
    expect((screen.getByLabelText('Фильтр задач') as HTMLInputElement).value).toBe('отчёт')
  })

  it('mounts the tasks section immediately when it was the active one', () => {
    useUiStore.setState({ section: 'tasks' })
    mount()
    expect(screen.getByLabelText('Фильтр задач')).toBeTruthy()
  })

  it('puts the notifications button and the profile in the bottom group of the rail', () => {
    mount()
    const buttons = within(screen.getByRole('navigation')).getAllByRole('button')
    const labels = buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent)
    expect(labels).toEqual(['Чаты', 'Задачи', 'Уведомления', 'Профиль: admin'])
  })

  it('streams notifications into toasts', () => {
    mount()
    act(() => { notificationsBridge.emitEvent({ type: 'notification.created', notification: makeNotification('1'), unreadCount: 1 }); }
    )
    const toaster = screen.getByRole('region', { name: 'Новые уведомления' })
    expect(within(toaster).getByText('Уведомление 1')).toBeTruthy()
  })
})
