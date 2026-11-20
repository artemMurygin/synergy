import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutModeProvider } from '../../layout/layout-mode'
import { ToastProvider } from '../../primitives/Toast'
import { isMacPlatform } from './use-search-shortcut'
import { ChatList, type ChatListProps, type ChatListThread } from './ChatList'

const SHORTCUT = isMacPlatform() ? '{Meta>}k{/Meta}' : '{Control>}k{/Control}'
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
  render(
    <LayoutModeProvider mode="desktop">
      <ToastProvider>
        <ChatList {...props} />
      </ToastProvider>
    </LayoutModeProvider>,
  )
  return { props, user: userEvent.setup() }
}

async function chooseFromMenu(user: ReturnType<typeof userEvent.setup>, item: 'Переименовать' | 'Удалить', index = 0) {
  const menus = screen.getAllByRole('button', { name: 'Меню чата' })
  const trigger = menus[index]
  if (!trigger) throw new Error('no menu button')
  await user.click(trigger)
  await user.click(await screen.findByRole('menuitem', { name: item }))
}

describe('ChatList', () => {
  it('hides its own header when the app draws the top bar (mobile)', () => {
    setup({ hideHeader: true })
    expect(screen.queryByRole('heading', { name: 'Чаты' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Новый чат' })).toBeNull()
    expect(screen.getByRole('searchbox', { name: 'Поиск' })).toBeTruthy()
  })

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
    await chooseFromMenu(user, 'Переименовать')
    const input = screen.getByRole('textbox', { name: 'Название чата' })
    await user.clear(input)
    await user.type(input, 'Новое имя{Enter}')
    expect(props.onRename).toHaveBeenCalledWith('t1', 'Новое имя')
  })

  it('cancels the rename with Escape and rejects an empty title', async () => {
    const { props, user } = setup()
    await chooseFromMenu(user, 'Переименовать')
    const input = screen.getByRole('textbox', { name: 'Название чата' })
    await user.clear(input)
    expect(screen.getByRole('button', { name: 'Сохранить название' }).hasAttribute('disabled')).toBe(true)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(props.onRename).not.toHaveBeenCalled()
  })

  it('shows a toast when the rename fails, keeps the previous title and retries with the same value', async () => {
    const onRename = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined)
    const { user } = setup({ onRename })
    await chooseFromMenu(user, 'Переименовать')
    await user.type(screen.getByRole('textbox', { name: 'Название чата' }), '!{Enter}')
    expect(await screen.findByText('Не удалось переименовать чат')).toBeTruthy()
    expect(screen.getByText('Сервер не принял новое название, прежнее сохранено.')).toBeTruthy()
    expect(screen.getByText('Цены на МВА')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRename).toHaveBeenCalledTimes(2)
    expect(onRename).toHaveBeenNthCalledWith(2, 't1', 'Цены на МВА!')
  })

  it('asks for confirmation before deleting', async () => {
    const { props, user } = setup()
    await chooseFromMenu(user, 'Удалить')
    expect(screen.getByText('Удалить чат вместе с историей? Это необратимо.')).toBeTruthy()
    expect(props.onDelete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByText(/Это необратимо/)).toBeNull()
    await chooseFromMenu(user, 'Удалить')
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(props.onDelete).toHaveBeenCalledWith('t1')
  })

  it('warns when the chat to delete has a running answer', async () => {
    const { user } = setup({ runningIds: ['t1'] })
    await chooseFromMenu(user, 'Удалить')
    expect(screen.getByText(/Агент сейчас отвечает в этом чате/)).toBeTruthy()
  })

  it('shows a toast when the delete fails and retries the same delete', async () => {
    const onDelete = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined)
    const { user } = setup({ onDelete })
    await chooseFromMenu(user, 'Удалить')
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(await screen.findByText('Не удалось удалить чат')).toBeTruthy()
    expect(screen.getByText('Чат остался в списке. Проверьте соединение и повторите.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onDelete).toHaveBeenCalledTimes(2)
    expect(onDelete).toHaveBeenNthCalledWith(2, 't1')
  })

  it('keeps toasts out of the way when the actions succeed', async () => {
    const { user } = setup()
    await chooseFromMenu(user, 'Удалить')
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    await waitFor(() => {
      expect(screen.queryByText('Не удалось удалить чат')).toBeNull()
    })
  })

  it('shows skeletons while loading', () => {
    setup({ state: 'loading', threads: [] })
    expect(screen.getByRole('status', { name: 'Загрузка чатов' })).toBeTruthy()
  })

  it('shows the empty state with the dashed icon in a 48 circle and without a button', () => {
    setup({ state: 'empty', threads: [] })
    expect(screen.getByText('Чатов пока нет')).toBeTruthy()
    expect(screen.getByText(/Начните новый чат по любой теме/)).toBeTruthy()
    expect(document.querySelector('svg.lucide-message-square-dashed')).not.toBeNull()
    expect(document.querySelector('.size-12')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Начать чат' })).toBeNull()
  })

  it('shows the error state with the alert icon, the connection text and a retry button with the rotate icon', async () => {
    const { props, user } = setup({ state: 'error', threads: [] })
    expect(screen.getByText('Не удалось загрузить чаты')).toBeTruthy()
    expect(screen.getByText('Нет связи с сервером. Повторите загрузку')).toBeTruthy()
    expect(document.querySelector('svg.lucide-circle-alert')).not.toBeNull()
    const retry = screen.getByRole('button', { name: 'Повторить' })
    expect(retry.querySelector('svg.lucide-rotate-ccw')).not.toBeNull()
    await user.click(retry)
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it('draws «Новый чат» with the square-pen icon', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Новый чат' }).querySelector('svg.lucide-square-pen')).not.toBeNull()
  })

  it('names the search shortcut in the placeholder on desktop only', () => {
    setup()
    expect(screen.getByRole('searchbox', { name: 'Поиск' }).getAttribute('placeholder')).toMatch(/^Поиск \((⌘K|Ctrl\+K)\)$/)
  })

  it('keeps the plain placeholder on mobile', () => {
    render(
      <LayoutModeProvider mode="mobile">
        <ToastProvider>
          <ChatList
            threads={threads}
            activeId={null}
            runningIds={[]}
            state="ready"
            onSelect={() => undefined}
            onCreate={() => undefined}
            onRename={() => undefined}
            onDelete={() => undefined}
            collapsed={false}
            onToggleCollapsed={() => undefined}
          />
        </ToastProvider>
      </LayoutModeProvider>,
    )
    expect(screen.getByRole('searchbox', { name: 'Поиск' }).getAttribute('placeholder')).toBe('Поиск')
  })

  it('focuses the search on the shortcut and clears it with Escape, returning focus to the composer', async () => {
    const composer = document.createElement('textarea')
    composer.setAttribute('data-chat-composer-input', '')
    document.body.append(composer)
    const { user } = setup()
    const field = screen.getByRole('searchbox', { name: 'Поиск' })
    await user.keyboard(SHORTCUT)
    expect(document.activeElement).toBe(field)
    await user.keyboard('скид')
    expect(field).toHaveProperty('value', 'скид')
    await user.keyboard('{Escape}')
    expect(field).toHaveProperty('value', '')
    expect(document.activeElement).toBe(composer)
    composer.remove()
  })

  it('shows the hidden list on the shortcut', async () => {
    const onToggleCollapsed = vi.fn()
    const { user } = setup({ collapsed: true, onToggleCollapsed })
    await user.keyboard(SHORTCUT)
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
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
      <ToastProvider><ChatList
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
      /></ToastProvider>,
    )
    expect(container.querySelector('section')).toBeNull()
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
