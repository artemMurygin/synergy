import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SectionSwitch } from './SectionSwitch'

describe('SectionSwitch', () => {
  it('shows both sections and marks the active one', () => {
    render(<SectionSwitch section="chat" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Чат' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Задачи' }).getAttribute('aria-selected')).toBe('false')
  })

  it('reports the chosen section', () => {
    const onChange = vi.fn()
    render(<SectionSwitch section="chat" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Задачи' }))
    expect(onChange).toHaveBeenCalledWith('tasks')
  })

  it('does not report a click on the active section', () => {
    const onChange = vi.fn()
    render(<SectionSwitch section="tasks" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Задачи' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
