import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NavRail } from './NavRail'

const chats = { id: 'chats', label: 'Чаты', icon: <svg /> }
const tasks = { id: 'tasks', label: 'Задачи', icon: <svg />, badge: 3 }
const items = [chats, tasks]

describe('NavRail', () => {
  it('marks the active item with aria-current and shows the badge', () => {
    render(<NavRail items={items} active="chats" onSelect={() => undefined} />)
    expect(screen.getByRole('button', { name: /Чаты/ }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: /Задачи/ }).getAttribute('aria-current')).toBeNull()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('calls onSelect with the item id and renders the footer', async () => {
    const onSelect = vi.fn()
    render(<NavRail items={items} active="chats" onSelect={onSelect} footer={<span>подвал</span>} />)
    await userEvent.click(screen.getByRole('button', { name: /Задачи/ }))
    expect(onSelect).toHaveBeenCalledWith('tasks')
    expect(screen.getByText('подвал')).toBeTruthy()
  })

  it('hides a zero badge and caps large ones', () => {
    render(
      <NavRail
        items={[{ ...chats, badge: 0 }, { ...tasks, badge: 150 }]}
        active="chats"
        onSelect={() => undefined}
      />,
    )
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.getByText('99+')).toBeTruthy()
  })
})
