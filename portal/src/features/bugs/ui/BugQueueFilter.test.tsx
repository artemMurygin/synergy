import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BugQueueFilter } from './BugQueueFilter'

afterEach(cleanup)

describe('BugQueueFilter', () => {
  it('shows the five filters as a button group with the value pressed', () => {
    render(<BugQueueFilter value="unclosed" onChange={() => undefined} />)
    const names = screen.getAllByRole('button').map((b) => b.textContent)
    expect(names).toEqual(['Незакрытые', 'Открыт', 'В работе', 'Исправлен', 'Не будет исправлен'])
    expect(screen.getByRole('button', { name: 'Незакрытые' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Исправлен' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onChange with the chosen filter', async () => {
    const onChange = vi.fn()
    render(<BugQueueFilter value="unclosed" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Исправлен' }))
    expect(onChange).toHaveBeenCalledWith('resolved')
  })

  it('marks the selected filter', () => {
    render(<BugQueueFilter value="wont_fix" onChange={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Не будет исправлен' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Незакрытые' }).getAttribute('aria-pressed')).toBe('false')
  })
})
