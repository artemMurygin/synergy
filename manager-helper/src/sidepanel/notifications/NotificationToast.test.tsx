import { LayoutModeProvider } from '@synergy/ui-kit'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeNotification } from '@/background/notifications/chrome-fake.testing'
import { NotificationToast } from './NotificationToast'

const TASK_NOTIFICATION = makeNotification('n1', '2026-11-10T11:58:00.000Z', {
  title: 'Вам назначена задача',
  body: 'ivanov назначил вас ответственным',
})

function renderToast(notification = TASK_NOTIFICATION) {
  const onOpen = vi.fn()
  const onDismiss = vi.fn()
  render(
    <LayoutModeProvider mode="tablet">
      <NotificationToast notification={notification} onOpen={onOpen} onDismiss={onDismiss} />
    </LayoutModeProvider>,
  )
  return { onOpen, onDismiss }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('NotificationToast', () => {
  it('shows the title, the text and the task action', () => {
    renderToast()
    const toast = screen.getByRole('status')
    expect(toast.textContent).toContain('Вам назначена задача')
    expect(toast.textContent).toContain('ivanov назначил вас ответственным')
    expect(toast.textContent).toContain('Открыть задачу')
  })

  it('shows the chat action and opens the notification', () => {
    const chat = { ...TASK_NOTIFICATION, target: { type: 'chat', id: 'c1' } }
    const { onOpen } = renderToast(chat)
    fireEvent.click(screen.getByRole('button', { name: /Открыть чат/ }))
    expect(onOpen).toHaveBeenCalledWith(chat)
  })

  it('hides the task action for other targets', () => {
    renderToast({ ...TASK_NOTIFICATION, target: { type: 'deal', id: 'd1' } })
    expect(screen.queryByText('Открыть задачу')).toBeNull()
  })

  it('offers the request action for a request target', () => {
    renderToast({ ...TASK_NOTIFICATION, target: { type: 'request', id: 'r1' } })
    expect(screen.getByRole('button', { name: /Открыть заявку/ })).toBeTruthy()
  })

  it('opens the notification by the action', () => {
    const { onOpen } = renderToast()
    fireEvent.click(screen.getByRole('button', { name: /Открыть задачу/ }))
    expect(onOpen).toHaveBeenCalledWith(TASK_NOTIFICATION)
  })

  it('is dismissed by the close button without opening', () => {
    const { onOpen, onDismiss } = renderToast()
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('is dismissed after the timeout', () => {
    vi.useFakeTimers()
    const { onDismiss } = renderToast()
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
