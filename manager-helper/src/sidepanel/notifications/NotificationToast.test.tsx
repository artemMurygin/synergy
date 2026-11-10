import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeNotification } from '@/background/notifications/chrome-fake.testing'
import { NotificationToast, TOAST_TIMEOUT_MS } from './NotificationToast'

const TASK_NOTIFICATION = makeNotification('n1', '2026-11-10T11:58:00.000Z', {
  title: 'Вам назначена задача',
  body: 'ivanov назначил вас ответственным',
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NotificationToast', () => {
  it('shows the title, the text and the task action', () => {
    render(
      <NotificationToast notification={TASK_NOTIFICATION} onOpen={vi.fn()} onDismiss={vi.fn()} />,
    )
    const toast = screen.getByRole('status')
    expect(toast.textContent).toContain('Вам назначена задача')
    expect(toast.textContent).toContain('ivanov назначил вас ответственным')
    expect(toast.textContent).toContain('Открыть задачу')
  })

  it('hides the task action for other targets', () => {
    const other = { ...TASK_NOTIFICATION, target: { type: 'deal', id: 'd1' } }
    render(<NotificationToast notification={other} onOpen={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.queryByText('Открыть задачу')).toBeNull()
  })

  it('opens the notification by a click on the card', () => {
    const onOpen = vi.fn()
    render(
      <NotificationToast notification={TASK_NOTIFICATION} onOpen={onOpen} onDismiss={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Вам назначена задача/ }))
    expect(onOpen).toHaveBeenCalledWith(TASK_NOTIFICATION)
  })

  it('is dismissed by the close button', () => {
    const onDismiss = vi.fn()
    const onOpen = vi.fn()
    render(
      <NotificationToast notification={TASK_NOTIFICATION} onOpen={onOpen} onDismiss={onDismiss} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('hides itself after the timeout and pauses while hovered', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(
      <NotificationToast notification={TASK_NOTIFICATION} onOpen={vi.fn()} onDismiss={onDismiss} />,
    )
    const toast = screen.getByRole('status')
    fireEvent.mouseEnter(toast)
    act(() => {
      vi.advanceTimersByTime(TOAST_TIMEOUT_MS * 2)
    })
    expect(onDismiss).not.toHaveBeenCalled()
    fireEvent.mouseLeave(toast)
    act(() => {
      vi.advanceTimersByTime(TOAST_TIMEOUT_MS)
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
