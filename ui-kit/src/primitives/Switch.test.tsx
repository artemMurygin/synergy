import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch', () => {
  it('has role switch and toggles with Space', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="Уведомления" onCheckedChange={onCheckedChange} />)
    const sw = screen.getByRole('switch', { name: 'Уведомления' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    sw.focus()
    await userEvent.keyboard(' ')
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  it('ignores input when disabled', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="X" disabled onCheckedChange={onCheckedChange} />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})
