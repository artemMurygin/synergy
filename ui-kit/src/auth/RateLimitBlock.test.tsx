import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatCountdown } from './format-countdown'
import { RateLimitBlock } from './RateLimitBlock'

describe('formatCountdown', () => {
  it.each([
    [42, '0:42'],
    [60, '1:00'],
    [605, '10:05'],
    [-3, '0:00'],
  ])('%i -> %s', (sec, text) => {
    expect(formatCountdown(sec)).toBe(text)
  })
})

describe('RateLimitBlock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the block with a disabled countdown button', () => {
    render(<RateLimitBlock retryAfterSec={42} onExpire={() => undefined} />)
    expect(screen.getByText('Слишком много попыток входа')).toBeTruthy()
    expect(screen.getByText(/Форма разблокируется автоматически/)).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Повторить через 0:42' })
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('counts down every second and calls onExpire once at zero', () => {
    const onExpire = vi.fn()
    render(<RateLimitBlock retryAfterSec={3} onExpire={onExpire} />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByRole('button', { name: 'Повторить через 0:02' })).toBeTruthy()
    expect(onExpire).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(onExpire).toHaveBeenCalledOnce()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onExpire).toHaveBeenCalledOnce()
  })
})
