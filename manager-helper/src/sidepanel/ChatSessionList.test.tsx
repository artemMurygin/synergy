import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Thread } from '@/shared/threads-api'
import { ChatSessionList } from './ChatSessionList'
import { formatActivity } from './session-time'

const session = (id: string, title: string): Thread => ({
  id,
  title,
  titleIsCustom: false,
  createdAt: '2026-11-05T09:00:00.000Z',
  lastActivityAt: '2026-11-05T09:00:00.000Z',
  running: false,
})

const SESSIONS = [session('a', 'Цены на MBA'), session('b', 'Пересдача вступительных')]

function setup(props: Partial<Parameters<typeof ChatSessionList>[0]> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onRetry: vi.fn(),
    onBack: vi.fn(),
  }
  render(
    <ChatSessionList sessions={SESSIONS} activeId="a" status="ready" {...handlers} {...props} />,
  )
  return handlers
}

describe('ChatSessionList states', () => {
  it('renders sessions, highlights the active one and selects on click', () => {
    const { onSelect } = setup()
    expect(screen.getByRole('button', { name: /Цены на MBA/ }).getAttribute('aria-current')).toBe(
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: /Пересдача вступительных/ }))
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('renders the empty state with a create action', () => {
    const { onCreate } = setup({ sessions: [], activeId: null })
    expect(screen.getByText('Чатов пока нет')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Начать чат' }))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('renders the error state with retry', () => {
    const { onRetry } = setup({ sessions: [], status: 'error' })
    expect(screen.getByText('Не удалось загрузить чаты')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders a skeleton while loading', () => {
    setup({ sessions: [], status: 'loading' })
    expect(screen.getByRole('status', { name: 'Загрузка чатов' })).toBeTruthy()
    expect(screen.queryByText('Чатов пока нет')).toBeNull()
  })

  it('hides the back button when no handler is given and creates from the header', () => {
    const { onCreate } = setup({ onBack: undefined })
    expect(screen.queryByRole('button', { name: 'Назад к чату' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Новый чат' }))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('goes back to the chat', () => {
    const { onBack } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Назад к чату' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('ChatSessionItem rename and delete', () => {
  const row = (title: string) => {
    const item = screen.getByText(title).closest('li')
    if (item === null) throw new Error('row not found')
    return item
  }

  it('renames inline with trimmed text', async () => {
    const { onRename } = setup()
    fireEvent.click(
      within(row('Пересдача вступительных')).getByRole('button', { name: 'Переименовать' }),
    )
    const input = screen.getByRole('textbox', { name: 'Название чата' })
    fireEvent.change(input, { target: { value: '  Вступительные  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('b', 'Вступительные')
    })
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Название чата' })).toBeNull()
    })
  })

  it('cancels renaming with Escape and does not save empty or unchanged names', () => {
    const { onRename } = setup()
    fireEvent.click(within(row('Цены на MBA')).getByRole('button', { name: 'Переименовать' }))
    const input = screen.getByRole('textbox', { name: 'Название чата' })
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'Название чата' })).toBeNull()
    expect(screen.getByText('Цены на MBA')).toBeTruthy()
  })

  it('keeps the field open with an error when renaming fails', async () => {
    const onRename = vi.fn().mockRejectedValue(new Error('x'))
    setup({ onRename })
    fireEvent.click(within(row('Цены на MBA')).getByRole('button', { name: 'Переименовать' }))
    const input = screen.getByRole('textbox', { name: 'Название чата' })
    fireEvent.change(input, { target: { value: 'Новое' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('Не удалось переименовать чат')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Название чата' })).toBeTruthy()
  })

  it('asks for confirmation before deleting and can be cancelled', () => {
    const { onDelete } = setup()
    fireEvent.click(
      within(row('Пересдача вступительных')).getByRole('button', { name: 'Удалить чат' }),
    )
    expect(screen.getByText(/Удалить чат вместе с историей/)).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByText(/Удалить чат вместе с историей/)).toBeNull()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('deletes after confirmation', async () => {
    const { onDelete } = setup()
    fireEvent.click(
      within(row('Пересдача вступительных')).getByRole('button', { name: 'Удалить чат' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }))
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('b')
    })
  })

  it('shows an error and keeps the confirmation when deleting fails', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('x'))
    setup({ onDelete })
    fireEvent.click(within(row('Цены на MBA')).getByRole('button', { name: 'Удалить чат' }))
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(await screen.findByText('Не удалось удалить чат')).toBeTruthy()
  })
})

describe('formatActivity', () => {
  const now = new Date('2026-11-05T15:00:00')
  it('formats today, yesterday and older dates', () => {
    expect(formatActivity('2026-11-05T12:20:00', now)).toBe('Сегодня, 12:20')
    expect(formatActivity('2026-11-04T18:40:00', now)).toBe('Вчера, 18:40')
    expect(formatActivity('2026-11-03T10:00:00', now)).toBe('3 ноября')
  })
})
