import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Thread } from '@/lib/backend/schema'
import { ChatListItem } from './ChatListItem'

afterEach(cleanup)

const thread: Thread = {
  id: 't1',
  title: 'Цены на МВА',
  titleIsCustom: false,
  createdAt: '2026-01-01T00:00:00Z',
  lastActivityAt: new Date().toISOString(),
  running: false
}

function setup(overrides: Partial<Thread> = {}, active = false) {
  const onSelect = vi.fn()
  const onRename = vi.fn().mockResolvedValue(undefined)
  const onDelete = vi.fn().mockResolvedValue(undefined)
  render(
    <ul>
      <ChatListItem
        thread={{ ...thread, ...overrides }}
        active={active}
        onSelect={onSelect}
        onRename={onRename}
        onDelete={onDelete}
      />
    </ul>
  )
  return { onSelect, onRename, onDelete, user: userEvent.setup() }
}

describe('ChatListItem normal mode', () => {
  it('shows title and last activity time', () => {
    setup()
    expect(screen.getByText('Цены на МВА')).toBeTruthy()
    expect(screen.getByText(/^Сегодня, \d{2}:\d{2}$/)).toBeTruthy()
  })

  it('marks the active chat', () => {
    setup({}, true)
    expect(screen.getByRole('button', { name: /Цены на МВА/ }).getAttribute('aria-current')).toBe(
      'true'
    )
  })

  it('does not mark an inactive chat', () => {
    setup()
    expect(screen.getByRole('button', { name: /Цены на МВА/ }).getAttribute('aria-current')).toBe(
      null
    )
  })

  it('calls onSelect with the thread id on click', async () => {
    const { onSelect, user } = setup()
    await user.click(screen.getByRole('button', { name: /Цены на МВА/ }))
    expect(onSelect).toHaveBeenCalledWith('t1')
  })

  it('shows a running indicator only for running chats', () => {
    setup({ running: true })
    expect(screen.getByRole('img', { name: 'Агент отвечает' })).toBeTruthy()
  })
})

describe('ChatListItem rename mode', () => {
  it('opens a field prefilled with the title', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Переименовать' }))
    expect((screen.getByRole('textbox', { name: 'Название чата' }) as HTMLInputElement).value).toBe(
      'Цены на МВА'
    )
  })

  it('saves on Enter and returns to normal mode', async () => {
    const { onRename, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Переименовать' }))
    const input = screen.getByRole('textbox', { name: 'Название чата' })
    await user.clear(input)
    await user.type(input, 'Новое имя{Enter}')
    expect(onRename).toHaveBeenCalledWith('t1', 'Новое имя')
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
  })

  it('cancels on Escape without saving', async () => {
    const { onRename, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Переименовать' }))
    await user.type(screen.getByRole('textbox', { name: 'Название чата' }), 'x{Escape}')
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Цены на МВА')).toBeTruthy()
  })

  it('blocks an empty title', async () => {
    const { onRename, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Переименовать' }))
    const input = screen.getByRole('textbox', { name: 'Название чата' })
    await user.clear(input)
    await user.type(input, '   {Enter}')
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('blocks a title longer than 120 characters', async () => {
    const { onRename, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Переименовать' }))
    const input = screen.getByRole('textbox', { name: 'Название чата' })
    await user.clear(input)
    await user.click(input)
    await user.paste('а'.repeat(121))
    await user.keyboard('{Enter}')
    expect(onRename).not.toHaveBeenCalled()
  })

  it('shows an error and stays in rename mode when saving fails', async () => {
    const { onRename, user } = setup()
    onRename.mockRejectedValue(new Error('fail'))
    await user.click(screen.getByRole('button', { name: 'Переименовать' }))
    await user.type(screen.getByRole('textbox', { name: 'Название чата' }), '!{Enter}')
    expect(await screen.findByText('Не удалось переименовать чат')).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })
})

describe('ChatListItem confirmDelete mode', () => {
  it('asks for confirmation', async () => {
    const { onDelete, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Удалить чат' }))
    expect(screen.getByText('Удалить чат вместе с историей? Это необратимо.')).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('returns to the row on Отмена', async () => {
    const { onDelete, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Удалить чат' }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByText(/Это необратимо/)).toBeNull()
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Цены на МВА')).toBeTruthy()
  })

  it('calls onDelete on Удалить', async () => {
    const { onDelete, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Удалить чат' }))
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(onDelete).toHaveBeenCalledWith('t1')
  })

  it('warns that a running answer will be interrupted', async () => {
    const { user } = setup({ running: true })
    await user.click(screen.getByRole('button', { name: 'Удалить чат' }))
    expect(screen.getByText(/ответ будет прерван/i)).toBeTruthy()
  })

  it('has no interrupt warning for an idle chat', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Удалить чат' }))
    expect(screen.queryByText(/ответ будет прерван/i)).toBeNull()
  })

  it('shows an error when deletion fails', async () => {
    const { onDelete, user } = setup()
    onDelete.mockRejectedValue(new Error('fail'))
    await user.click(screen.getByRole('button', { name: 'Удалить чат' }))
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(await screen.findByText('Не удалось удалить чат')).toBeTruthy()
  })
})
