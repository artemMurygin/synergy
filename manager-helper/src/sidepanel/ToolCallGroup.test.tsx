import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToolCallGroup, type ToolCallView } from './ToolCallGroup'

const calls: ToolCallView[] = [
  { id: '1', name: 'search_books', args: { книги: ['ДПО', 'Магистратура'] }, status: 'complete' },
  { id: '2', name: 'find_programs', args: { запрос: 'МВА, очно' }, status: 'running' },
]

const toggle = () => screen.getByRole('button', { name: /Ход работы/ })

describe('ToolCallGroup', () => {
  it('is collapsed by default and hides the calls', () => {
    render(<ToolCallGroup toolCalls={calls} status="running" />)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('search_books')).toBeNull()
  })

  it('expands on click and collapses on a second click', () => {
    render(<ToolCallGroup toolCalls={calls} status="running" />)
    fireEvent.click(toggle())
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('search_books')).toBeTruthy()
    fireEvent.click(toggle())
    expect(screen.queryByText('search_books')).toBeNull()
  })

  it('shows name, arguments and status of each call', () => {
    render(<ToolCallGroup toolCalls={calls} status="running" />)
    fireEvent.click(toggle())
    expect(screen.getByText('find_programs')).toBeTruthy()
    expect(screen.getByText('книги: ДПО, Магистратура')).toBeTruthy()
    expect(screen.getByText('запрос: МВА, очно')).toBeTruthy()
    expect(screen.getAllByRole('img', { name: 'завершён' })).toHaveLength(1)
    expect(screen.getAllByRole('img', { name: 'выполняется' })).toHaveLength(1)
  })

  it('shows progress in the header while running', () => {
    render(<ToolCallGroup toolCalls={calls} status="running" />)
    expect(toggle().textContent).toContain('идёт · 1 из 2')
  })

  it('shows the call count and duration when complete', () => {
    const done = calls.map((c) => ({ ...c, status: 'complete' as const }))
    render(<ToolCallGroup toolCalls={done} status="complete" durationMs={1200} />)
    expect(toggle().textContent).toContain('2 вызова · 1,2 с')
  })

  it('pluralizes the counter', () => {
    const one = calls.slice(0, 1)
    render(<ToolCallGroup toolCalls={one} status="complete" />)
    expect(toggle().textContent).toContain('1 вызов')
  })

  it('shows the aborted state', () => {
    render(<ToolCallGroup toolCalls={calls} status="aborted" />)
    expect(toggle().textContent).toContain('2 вызова · прервано')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('renders nothing without calls', () => {
    const { container } = render(<ToolCallGroup toolCalls={[]} status="complete" />)
    expect(container.firstChild).toBeNull()
  })
})
