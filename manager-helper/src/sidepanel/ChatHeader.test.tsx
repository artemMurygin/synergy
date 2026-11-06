import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatHeader } from './ChatHeader'

const noop = () => undefined

describe('ChatHeader', () => {
  it('shows the chat title and wires the actions', () => {
    const onOpenList = vi.fn()
    const onNewChat = vi.fn()
    const onOpenSettings = vi.fn()
    render(
      <ChatHeader
        title="Цены на MBA"
        onOpenList={onOpenList}
        onNewChat={onNewChat}
        onOpenSettings={onOpenSettings}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Цены на MBA' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'К списку чатов' }))
    fireEvent.click(screen.getByRole('button', { name: 'Новый чат' }))
    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    expect(onOpenList).toHaveBeenCalledTimes(1)
    expect(onNewChat).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('hides the list button when no handler is given (wide panel)', () => {
    render(<ChatHeader title="Чат" onNewChat={noop} onOpenSettings={noop} />)
    expect(screen.queryByRole('button', { name: 'К списку чатов' })).toBeNull()
  })

  it('disables the new chat button while a chat is being created', () => {
    const onNewChat = vi.fn()
    render(<ChatHeader title="Чат" onNewChat={onNewChat} onOpenSettings={noop} newChatDisabled />)
    const button = screen.getByRole('button', { name: 'Новый чат' })
    expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.click(button)
    expect(onNewChat).not.toHaveBeenCalled()
  })

  it('falls back to a default title for an empty one', () => {
    render(<ChatHeader title="" onNewChat={noop} onOpenSettings={noop} />)
    expect(screen.getByRole('heading', { name: 'Новый чат' })).toBeTruthy()
  })
})
