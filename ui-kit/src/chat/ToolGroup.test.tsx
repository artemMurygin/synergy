import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessagePrimitive, AssistantRuntimeProvider, ThreadPrimitive, useLocalRuntime } from '@assistant-ui/react'
import type { ChatModelAdapter, ChatModelRunResult } from '@assistant-ui/react'
import { describe, expect, it } from 'vitest'
import { LayoutModeProvider } from '../layout/layout-mode'
import { must } from '../test-utils'
import { ToolCallRow, ToolFallback, ToolGroup, ToolGroupParts } from './ToolGroup'
import type { ToolCallView } from './tool-status'

const calls: ToolCallView[] = [
  { id: '1', name: 'search_books', args: { книги: ['ДПО'] }, result: 'найдено 3', status: 'complete' },
  { id: '2', name: 'find_programs', args: { запрос: 'МВА' }, result: { count: 3 }, status: 'complete' },
]

const toggle = () => screen.getByRole('button', { name: /вызов|Вызываю/ })

describe('ToolGroup', () => {
  it('is collapsed by default', () => {
    render(<ToolGroup calls={calls} />)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('search_books')).toBeNull()
  })

  it('shows "выполняется" while a call is running', () => {
    render(<ToolGroup calls={[must(calls[0]), { id: '3', name: 'x', args: {}, status: 'running' }]} />)
    expect(toggle().textContent).toContain('Выполняется · 1 из 2')
  })

  it('is expanded while calls run and folds when the run ends unless the user opened it', () => {
    const running = [must(calls[0]), { id: '3', name: 'x', args: {}, status: 'running' as const }]
    const { rerender } = render(<ToolGroup calls={running} />)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    rerender(<ToolGroup calls={calls} />)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('stays open after the run when the user opened it themselves', async () => {
    const user = userEvent.setup()
    const running = [must(calls[0]), { id: '3', name: 'x', args: {}, status: 'running' as const }]
    const { rerender } = render(<ToolGroup calls={running} />)
    await user.click(toggle())
    await user.click(toggle())
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    rerender(<ToolGroup calls={calls} />)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
  })

  it('shows only "K из N" in the status on mobile', () => {
    render(
      <LayoutModeProvider mode="mobile">
        <ToolGroup calls={[must(calls[0]), { id: '3', name: 'x', args: {}, status: 'running' }]} />
      </LayoutModeProvider>,
    )
    expect(toggle().textContent).toContain('1 из 2')
    expect(toggle().textContent).not.toContain('Выполняется')
  })

  it('shows "1 ошибка" in the header when a call failed', () => {
    render(<ToolGroup calls={[must(calls[0]), { id: '3', name: 'x', args: {}, status: 'error', result: 'boom' }]} />)
    expect(toggle().textContent).toContain('1 ошибка')
  })

  it('shows the count and "готово" when everything is done', () => {
    render(<ToolGroup calls={calls} />)
    expect(toggle().textContent).toContain('2 вызова инструментов')
    expect(toggle().textContent).toContain('2 готово')
  })

  it('renders nothing without calls', () => {
    const { container } = render(<ToolGroup calls={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('expands into rows with the tool name set in the mono font and the status', async () => {
    const user = userEvent.setup()
    render(
      <ToolGroup
        calls={[...calls, { id: '3', name: 'read_rows', args: {}, status: 'error', result: 'нет доступа' }]}
      />,
    )
    await user.click(toggle())
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    const name = screen.getByText('search_books')
    expect(name.className).toContain('font-mono')
    expect(screen.getAllByRole('img', { name: 'завершён' })).toHaveLength(2)
    expect(screen.getAllByRole('img', { name: 'ошибка' })).toHaveLength(1)
  })

  it('shows arguments and the result when a row is expanded', async () => {
    const user = userEvent.setup()
    render(<ToolGroup calls={calls} />)
    await user.click(toggle())
    expect(screen.queryByText('Аргументы')).toBeNull()
    await user.click(screen.getByRole('button', { name: /search_books/ }))
    expect(screen.getByText('Аргументы')).toBeTruthy()
    expect(screen.getByText('Результат')).toBeTruthy()
    expect(screen.getByText('найдено 3')).toBeTruthy()
  })
})

describe('ToolCallRow', () => {
  it('shows the duration of a call like "0,4 с"', () => {
    render(<ToolCallRow call={{ id: '1', name: 'x', args: {}, status: 'complete', durationMs: 400 }} />)
    expect(screen.getByText('0,4 с')).toBeTruthy()
  })

  it('shows no duration when it is unknown', () => {
    render(<ToolCallRow call={{ id: '1', name: 'x', args: {}, status: 'complete' }} />)
    expect(screen.queryByText(/ с$/)).toBeNull()
  })

  it('shows the error text instead of the arguments for a failed call', () => {
    render(
      <ToolCallRow
        call={{ id: '1', name: 'get_prices', args: { год: 2026 }, status: 'error', result: 'Сервис цен недоступен', error: 'Сервис цен недоступен' }}
      />,
    )
    expect(screen.getByText('Сервис цен недоступен')).toBeTruthy()
    expect(screen.queryByText(/год: 2026/)).toBeNull()
    expect(screen.getByRole('img', { name: 'ошибка' })).toBeTruthy()
  })

  it('shows no result block while the call is running', async () => {
    const user = userEvent.setup()
    render(<ToolCallRow call={{ id: '1', name: 'x', args: { a: 1 }, status: 'running' }} />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('Аргументы')).toBeTruthy()
    expect(screen.queryByText('Результат')).toBeNull()
  })
})

const adapter: ChatModelAdapter = {
  async *run() {
    await Promise.resolve()
    const content: ChatModelRunResult['content'] = [
        { type: 'tool-call', toolCallId: 't1', toolName: 'search_books', args: { q: 'МВА' }, argsText: '{"q":"МВА"}', result: 'ok', artifact: { durationMs: 400 } },
        { type: 'tool-call', toolCallId: 't2', toolName: 'find_programs', args: {}, argsText: '{}', result: 'boom', isError: true },
        { type: 'text', text: 'Готово' },
    ]
    yield { content }
  },
}

function Harness() {
  const runtime = useLocalRuntime(adapter)
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root>
        <ThreadPrimitive.Messages>
          {({ message }) =>
            message.role === 'assistant' ? (
              <MessagePrimitive.Root>
                <MessagePrimitive.Parts components={{ ToolGroup: ToolGroupParts, tools: { Fallback: ToolFallback } }} />
              </MessagePrimitive.Root>
            ) : (
              <div />
            )
          }
        </ThreadPrimitive.Messages>
        <Sender />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

import { useAui } from '@assistant-ui/react'
import { useEffect } from 'react'

function Sender() {
  const aui = useAui()
  useEffect(() => {
    aui.thread.append('вопрос')
  }, [aui])
  return null
}

describe('ToolGroup in MessagePrimitive.Parts', () => {
  it('groups the tool-call parts of a message through components.ToolGroup and tools.Fallback', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const header = await screen.findByRole('button', { name: /2 вызова инструментов/ })
    expect(header.textContent).toContain('ошибка')
    expect(header.getAttribute('aria-expanded')).toBe('false')
    await user.click(header)
    expect(screen.getByText('search_books')).toBeTruthy()
    expect(screen.getByText('find_programs')).toBeTruthy()
  })

  it('shows the duration the server saved and the error text of a failed call', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(await screen.findByRole('button', { name: /2 вызова инструментов/ }))
    expect(screen.getByText('0,4 с')).toBeTruthy()
    expect(screen.getByText('boom')).toBeTruthy()
  })
})
