import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TabBar } from './TabBar'

const items = [
  { id: 'chats', label: 'Чаты', icon: <svg /> },
  { id: 'tasks', label: 'Задачи', icon: <svg />, badge: 2 },
]

describe('TabBar', () => {
  it('marks the active tab, shows the badge and selects on click', async () => {
    const onSelect = vi.fn()
    render(<TabBar items={items} active="tasks" onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /Задачи/ }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('2')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /Чаты/ }))
    expect(onSelect).toHaveBeenCalledWith('chats')
  })
})
