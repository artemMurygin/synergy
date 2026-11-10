import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DeadlineLabel } from './DeadlineLabel'
import { StatusBadge } from './StatusBadge'
import { isOverdue, STATUS_META } from './status'
import { NOW } from './test-utils'

afterEach(cleanup)

const PAST = '2026-03-05T00:00:00Z'
const FUTURE = '2026-03-20T00:00:00Z'

describe('STATUS_META', () => {
  it('maps every status to a Russian label', () => {
    expect(STATUS_META.todo.label).toBe('К выполнению')
    expect(STATUS_META.in_progress.label).toBe('В работе')
    expect(STATUS_META.done.label).toBe('Готово')
  })
})

describe('isOverdue', () => {
  it('is true only for open tasks with a deadline in the past', () => {
    expect(isOverdue('todo', PAST, NOW)).toBe(true)
    expect(isOverdue('in_progress', PAST, NOW)).toBe(true)
    expect(isOverdue('done', PAST, NOW)).toBe(false)
    expect(isOverdue('todo', FUTURE, NOW)).toBe(false)
    expect(isOverdue('todo', null, NOW)).toBe(false)
  })
})

describe('StatusBadge', () => {
  it.each([
    ['todo', 'К выполнению'],
    ['in_progress', 'В работе'],
    ['done', 'Готово']
  ] as const)('shows the status %s as text', (status, text) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(text)).toBeTruthy()
  })
})

describe('DeadlineLabel', () => {
  it('says "Просрочено" for an open task past its deadline', () => {
    render(<DeadlineLabel status="todo" deadline={PAST} now={NOW} />)
    expect(screen.getByText(/Просрочено/)).toBeTruthy()
  })

  it('says "Просрочено" for an in-progress task past its deadline', () => {
    render(<DeadlineLabel status="in_progress" deadline={PAST} now={NOW} />)
    expect(screen.getByText(/Просрочено/)).toBeTruthy()
  })

  it('does not say "Просрочено" for a future deadline', () => {
    render(<DeadlineLabel status="todo" deadline={FUTURE} now={NOW} />)
    expect(screen.queryByText(/Просрочено/)).toBeNull()
  })

  it('says "Закрыто" for a done task and never "Просрочено"', () => {
    render(<DeadlineLabel status="done" deadline={PAST} now={NOW} />)
    expect(screen.getByText('Закрыто')).toBeTruthy()
    expect(screen.queryByText(/Просрочено/)).toBeNull()
  })

  it('shows a placeholder without a deadline', () => {
    render(<DeadlineLabel status="todo" deadline={null} now={NOW} />)
    expect(screen.getByText('Без срока')).toBeTruthy()
  })
})
