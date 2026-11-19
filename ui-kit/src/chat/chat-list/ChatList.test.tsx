import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { must } from '../../test-utils'
import { ChatList, type ChatListProps, type ChatListThread } from './ChatList'

const today = new Date()
const threads: ChatListThread[] = [
  { id: 't1', title: 'Цены на МВА', lastActivityAt: today.toISOString() },
  { id: 't2', title: 'Скидки для корпоративных клиентов', lastActivityAt: new Date(2020, 0, 5).toISOString() },
]

function setup(overrides: Partial<ChatListProps> = {}) {
  const props: ChatListProps = {
    threads,
    activeId: 't1',
    runningIds: [],
    state: 'ready',
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onRetry: vi.fn(),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    ...overrides,
  }
  render(<ChatList {...props} />)
  return { props, user: userEvent.setup() }
}

describe('ChatList', () => {
  it('shows compact rows with the title and the time, and marks the active one', () => {
    setup()
    expect(screen.getByText('Цены на МВА')).toBeTruthy()
    expect(screen.getByText('5 января 2020')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Цены на МВА/ }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: /Скидки/ }).getAttribute('aria-current')).toBeNull()
  })

  it('marks a chat where the agent answers', () => {
    setup({ runningIds: ['t2'] })
    const row = screen.getByRole('button', { name: /Скидки/ })
    expect(within(row).getByRole('img', { name: 'Агент отвечает' })).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /Цены/ })).queryByRole('img')).toBeNull()
  })

  it('selects a chat and creates a new one', async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole('button', { name: /Скидки/ }))
    expect(props.onSelect).toHaveBeenCalledWith('t2')
    await user.click(screen.getByRole('button', { name: 'Новый чат' }))
    expect(props.onCreate).toHaveBeenCalledTimes(1)
  })

  it('renames a chat inline with Enter', async () => {
    const { props, user } = setup()
    await user.click(must(screen.getAllByRole('button', { name: 'Переименовать' })[0]))
    const input = screen.getByRole('textbox', { name: 'Название чата' })
    await user.clear(input)
    await user.type(input, 'Новое имя{Enter}')
    expect(props.onRename).toHaveBeenCalledWith('t1', 'Новое имя')
  })

  it('cancels the rename with Escape and rejects an empty title', async () => {
    const { props, user } = setup()
    await user.click(must(screen.getAllByRole('button', { name: 'Переименовать' })[0]))
    const input = screen.getByRole('textbox', { name: 'Название чата' })
    await user.clear(input)
    expect(screen.getByRole('button', { name: 'Сохранить название' }).hasAttribute('disabled')).toBe(true)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(props.onRename).not.toHaveBeenCalled()
  })

  it('shows the error when the rename fails and keeps the editor', async () => {
    const { user } = setup({ onRename: vi.fn().mockRejectedValue(new Error('x')) })
    await user.click(must(screen.getAllByRole('button', { name: 'Переименовать' })[0]))
    const input = screen.getByRole('textbox', { name: 'Название чата' })
    await user.type(input, '!{Enter}')
    expect(await screen.findByText('Не удалось переименовать чат')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Название чата' })).toBeTruthy()
  })

  it('asks for confirmation before deleting', async () => {
    const { props, user } = setup()
    await user.click(must(screen.getAllByRole('button', { name: 'Удалить чат' })[0]))
    expect(screen.getByText('Удалить чат вместе с историей? Это необратимо.')).toBeTruthy()
    expect(props.onDelete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByText(/Это необратимо/)).toBeNull()
    await user.click(must(screen.getAllByRole('button', { name: 'Удалить чат' })[0]))
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(props.onDelete).toHaveBeenCalledWith('t1')
  })

  it('warns when the chat to delete has a running answer', async () => {
    const { user } = setup({ runningIds: ['t1'] })
    await user.click(must(screen.getAllByRole('button', { name: 'Удалить чат' })[0]))
    expect(screen.getByText(/Агент сейчас отвечает в этом чате/)).toBeTruthy()
  })

  it('shows skeletons while loading', () => {
    setup({ state: 'loading', threads: [] })
    expect(screen.getByRole('status', { name: 'Загрузка чатов' })).toBeTruthy()
  })

  it('shows the empty state with a create action', async () => {
    const { props, user } = setup({ state: 'empty', threads: [] })
    expect(screen.getByText('Чатов пока нет')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Начать чат' }))
    expect(props.onCreate).toHaveBeenCalledTimes(1)
  })

  it('shows the error state with a retry action', async () => {
    const { props, user } = setup({ state: 'error', threads: [] })
    expect(screen.getByText('Не удалось загрузить чаты')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it('hides the list with the toggle button and renders nothing when collapsed', async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Скрыть список чатов' }))
    expect(props.onToggleCollapsed).toHaveBeenCalledTimes(1)
  })
})

describe('ChatList collapsed', () => {
  it('renders nothing', () => {
    const { container } = render(
      <ChatList
        threads={threads}
        activeId={null}
        runningIds={[]}
        state="ready"
        onSelect={() => undefined}
        onCreate={() => undefined}
        onRename={() => undefined}
        onDelete={() => undefined}
        collapsed
        onToggleCollapsed={() => undefined}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
  describe('search', () => {
    it('filters by a substring of the title ignoring case and hides empty date groups', async () => {
      const { user } = setup()
      expect(screen.getByText('Сегодня')).toBeTruthy()
      await user.type(screen.getByRole('searchbox', { name: 'Поиск' }), 'СКИДКИ')
      expect(screen.queryByText('Цены на МВА')).toBeNull()
      expect(screen.getByText('Скидки для корпоративных клиентов')).toBeTruthy()
      expect(screen.queryByText('Сегодня')).toBeNull()
      expect(screen.getByText('Ранее')).toBeTruthy()
    })

    it('shows "Ничего не найдено" without matches and restores the list on clear', async () => {
      const { user } = setup()
      const field = screen.getByRole('searchbox', { name: 'Поиск' })
      await user.type(field, 'zzz')
      expect(screen.getByText('Ничего не найдено')).toBeTruthy()
      await user.clear(field)
      expect(screen.queryByText('Ничего не найдено')).toBeNull()
      expect(screen.getByText('Цены на МВА')).toBeTruthy()
      expect(screen.getByText('Скидки для корпоративных клиентов')).toBeTruthy()
    })
  })
})
