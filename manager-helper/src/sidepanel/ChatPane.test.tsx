import { HttpAgent } from '@ag-ui/client'
import type { LayoutMode } from '@synergy/ui-kit'
import { LayoutModeProvider } from '@synergy/ui-kit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
