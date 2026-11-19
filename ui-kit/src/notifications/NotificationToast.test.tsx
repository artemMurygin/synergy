import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationToast } from './NotificationToast'

describe('NotificationToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides itself after the timeout and reports it', () => {
    const onClose = vi.fn()
    render(<NotificationToast title="Задача назначена" text="Текст" duration={6000} onClose={onClose} />)
    expect(screen.getByRole('status')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(5900)
    })
    expect(screen.queryByRole('status')).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.queryByRole('status')).toBeNull()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('pauses the timer on hover', () => {
    render(<NotificationToast title="Т" text="x" duration={1000} />)
    const toast = screen.getByRole('status')
    act(() => {
      toast.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByRole('status')).not.toBeNull()
  })

  it('runs the action and closes via the close button', async () => {
    vi.useRealTimers()
    const onAction = vi.fn()
    const onClose = vi.fn()
    render(<NotificationToast title="Т" text="x" actionLabel="Открыть задачу" onAction={onAction} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Открыть задачу' }))
    expect(onAction).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
