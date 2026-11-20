import { HttpAgent } from '@ag-ui/client'
import type { LayoutMode } from '@synergy/ui-kit'
import { LayoutModeProvider } from '@synergy/ui-kit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveSessionId } from '@/shared/active-session'
import { createAgent } from '@/shared/agent-client'
import { getThread } from '@/shared/threads-api'
import type { Thread } from '@/shared/threads-api'
import { ChatPane } from './ChatPane'
import { ChatRuntimeProvider } from './ChatRuntimeProvider'

vi.mock('@/shared/active-session')
vi.mock('@/shared/agent-client')
vi.mock('@/shared/threads-api')
vi.mock('./attachments/use-file-upload-port', () => ({
  useFileUploadPort: () => ({ upload: vi.fn() }),
}))

const thread = (id: string, title: string, running = false): Thread => ({
  id,
  title,
  titleIsCustom: true,
  createdAt: '2026-11-19T09:00:00.000Z',
  lastActivityAt: new Date().toISOString(),
  running,
})

const SESSIONS = [thread('a', 'Цены на MBA'), thread('b', 'Скидки', true)]

function handlers() {
  return {
    onModeChange: vi.fn(),
    onCreate: vi.fn(),
    onSelect: vi.fn(),
    create: vi.fn(),
    rename: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    onRetryList: vi.fn(),
    onStopServerRun: vi.fn(),
    onSettled: vi.fn(),
    onFinishedApplied: vi.fn(),
  }
}

function tree(layout: LayoutMode, mode: 'chat' | 'list', fns = handlers()) {
  return (
    <LayoutModeProvider mode={layout}>
      <ChatRuntimeProvider activeId="a" onSelect={vi.fn()} onCreate={vi.fn()}>
        <ChatPane
          sessions={SESSIONS}
          status="ready"
          activeId="a"
          mode={mode}
          creating={false}
          serverRunning={false}
          finished={null}
          notifications={<button type="button">Уведомления-тест</button>}
          profile={<button type="button">Профиль-тест</button>}
          {...fns}
        />
      </ChatRuntimeProvider>
    </LayoutModeProvider>
  )
}

const listPane = () => screen.queryByRole('complementary', { name: 'Список чатов' })

async function ready() {
  await waitFor(() => {
    expect(screen.getByPlaceholderText('Сообщение агенту')).toBeTruthy()
  })
}

beforeEach(() => {
  sessionStorage.clear()
  const agent = new HttpAgent({ url: 'http://api.test/agent', threadId: 'a' })
  vi.mocked(createAgent).mockResolvedValue(agent)
  vi.mocked(setActiveSessionId).mockResolvedValue(undefined)
  vi.mocked(getThread).mockResolvedValue({ running: false, messages: [] })
})

describe('ChatPane on a wide panel', () => {
  it('shows the list and the chat in separate panels and opens a chat on click', async () => {
    const fns = handlers()
    render(tree('tablet', 'chat', fns))
    await ready()
    expect(listPane()).not.toBeNull()
    expect(screen.getByRole('main')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Скидки/ }))
    expect(fns.onSelect).toHaveBeenCalledWith('b')
  })

  it('has no second title row: the chat header carries the title and the time', async () => {
    render(tree('tablet', 'chat'))
    await ready()
    expect(screen.getAllByText('Цены на MBA')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Цены на MBA' })).toBeTruthy()
    expect(screen.getByText(/^Сегодня, \d\d:\d\d$/)).toBeTruthy()
    expect(screen.queryByText('Уведомления-тест')).toBeNull()
  })

  it('hides the list with the button and brings it back from the chat header', async () => {
    render(tree('tablet', 'chat'))
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть список чатов' }))
    expect(listPane()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Показать список чатов' }))
    expect(listPane()).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Показать список чатов' })).toBeNull()
  })
})

describe('ChatPane on a narrow panel', () => {
  it('shows one top bar with the list button, title, time, create, notifications and profile', async () => {
    const fns = handlers()
    render(tree('mobile', 'chat', fns))
    await ready()
    expect(listPane()).toBeNull()
    expect(screen.getAllByText('Цены на MBA')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Цены на MBA', level: 1 })).toBeTruthy()
    expect(screen.getByText(/^Сегодня, \d\d:\d\d$/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Уведомления-тест' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Профиль-тест' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Новый чат' }))
    expect(fns.onCreate).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'К списку чатов' }))
    expect(fns.onModeChange).toHaveBeenCalledWith('list')
  })

  it('shows the list screen with the search, create, notifications and profile, without a back button', async () => {
    const fns = handlers()
    render(tree('mobile', 'list', fns))
    await ready().catch(() => undefined)
    expect(screen.getByRole('heading', { name: 'Чаты', level: 1 })).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: 'Поиск' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'К списку чатов' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Новый чат' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Уведомления-тест' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Профиль-тест' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Сообщение агенту' })).toBeNull()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск' }), { target: { value: 'скид' } })
    expect(screen.queryByRole('button', { name: /Цены/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Скидки/ }))
    expect(fns.onSelect).toHaveBeenCalledWith('b')
    expect(fns.onModeChange).toHaveBeenCalledWith('chat')
  })
})

describe('ChatPane across the 640 px threshold', () => {
  it('keeps the draft and the active chat', async () => {
    const fns = handlers()
    const { rerender } = render(tree('mobile', 'chat', fns))
    await ready()
    fireEvent.change(screen.getByPlaceholderText('Сообщение агенту'), {
      target: { value: 'черновик' },
    })
    rerender(tree('tablet', 'chat', fns))
    const field = screen.getByPlaceholderText('Сообщение агенту')
    expect(field instanceof HTMLTextAreaElement && field.value).toBe('черновик')
    expect(screen.getByRole('heading', { name: 'Цены на MBA' })).toBeTruthy()
    expect(listPane()).not.toBeNull()
  })
})

const inChat = () => within(screen.getByRole('main'))

describe('ChatPane header: search and menu', () => {
  const withMessages = () => {
    vi.mocked(getThread).mockResolvedValue({
      running: false,
      messages: [
        { id: 'm0', role: 'user', content: 'Сколько стоит МВА?' },
        { id: 'm1', role: 'assistant', content: 'Цена МВА 420 000' },
      ],
    })
  }

  it('shows the search and the chat menu on a wide panel only', async () => {
    withMessages()
    const { unmount } = render(tree('tablet', 'chat'))
    await waitFor(() => {
      expect(screen.getByText('Цена МВА 420 000')).toBeTruthy()
    })
    expect(inChat().getByRole('button', { name: 'Поиск по чату' })).toBeTruthy()
    expect(inChat().getByRole('button', { name: 'Меню чата' })).toBeTruthy()
    unmount()
    render(tree('mobile', 'chat'))
    await waitFor(() => {
      expect(screen.getByText('Цена МВА 420 000')).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: 'Поиск по чату' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Меню чата' })).toBeNull()
  })

  it('has no menu for a new chat without messages', async () => {
    render(tree('tablet', 'chat'))
    await ready()
    expect(inChat().getByRole('button', { name: 'Меню чата' }).hasAttribute('disabled')).toBe(true)
  })

  it('opens the search bar above the feed from the header button', async () => {
    withMessages()
    render(tree('tablet', 'chat'))
    await waitFor(() => {
      expect(screen.getByText('Цена МВА 420 000')).toBeTruthy()
    })
    fireEvent.click(inChat().getByRole('button', { name: 'Поиск по чату' }))
    expect(inChat().getByRole('searchbox', { name: /чату/ })).toBeTruthy()
  })

  it('renames the chat from the menu', async () => {
    withMessages()
    const fns = handlers()
    render(tree('tablet', 'chat', fns))
    await waitFor(() => {
      expect(screen.getByText('Цена МВА 420 000')).toBeTruthy()
    })
    fireEvent.pointerDown(inChat().getByRole('button', { name: 'Меню чата' }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Переименовать' }))
    const input = await screen.findByLabelText('Название чата')
    fireEvent.change(input, { target: { value: 'Новое имя' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => {
      expect(fns.rename).toHaveBeenCalledWith('a', 'Новое имя')
    })
  })

  it('deletes the chat from the menu only after the confirmation', async () => {
    withMessages()
    const fns = handlers()
    render(tree('tablet', 'chat', fns))
    await waitFor(() => {
      expect(screen.getByText('Цена МВА 420 000')).toBeTruthy()
    })
    fireEvent.pointerDown(inChat().getByRole('button', { name: 'Меню чата' }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить' }))
    expect(fns.remove).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить чат' }))
    await waitFor(() => {
      expect(fns.remove).toHaveBeenCalledWith('a')
    })
  })

  it('tells by a toast with a retry when the server refuses the rename', async () => {
    withMessages()
    const fns = handlers()
    fns.rename.mockRejectedValue(new Error('no'))
    render(tree('tablet', 'chat', fns))
    await waitFor(() => {
      expect(screen.getByText('Цена МВА 420 000')).toBeTruthy()
    })
    fireEvent.pointerDown(inChat().getByRole('button', { name: 'Меню чата' }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Переименовать' }))
    fireEvent.change(await screen.findByLabelText('Название чата'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Не удалось переименовать чат')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy()
  })
})
