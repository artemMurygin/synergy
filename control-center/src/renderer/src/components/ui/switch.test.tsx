import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Switch } from './switch'

afterEach(cleanup)

describe('Switch', () => {
  it('is a named switch that reports its state', () => {
    render(<Switch aria-label="Уведомления" checked onCheckedChange={vi.fn()} />)
    const control = screen.getByRole('switch', { name: 'Уведомления' })
    expect(control.getAttribute('aria-checked')).toBe('true')
    expect(control.getAttribute('data-state')).toBe('checked')
  })

  it('asks to flip the value on click', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="Уведомления" checked={false} onCheckedChange={onCheckedChange} />)
    await userEvent.setup().click(screen.getByRole('switch'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('ignores clicks while disabled', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="Уведомления" checked disabled onCheckedChange={onCheckedChange} />)
    await userEvent.setup().click(screen.getByRole('switch'))
    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(screen.getByRole('switch')).toHaveProperty('disabled', true)
  })
})
