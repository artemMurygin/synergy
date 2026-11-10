import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DeadlineLabel, formatShortDate, formatShortDateTime } from './DeadlineLabel'

afterEach(cleanup)

// Local-time ISO strings so the output does not depend on the runner's time zone
const local = (y: number, m: number, d: number, h = 0, min = 0): string => new Date(y, m - 1, d, h, min).toISOString()

const NOW = new Date(2026, 10, 10, 12, 0)

describe('formatShortDate / formatShortDateTime', () => {
  it('uses short month names without dots', () => {
    expect(formatShortDate(local(2026, 11, 5, 9))).toBe('5 ноя')
    expect(formatShortDate(local(2026, 5, 1))).toBe('1 мая')
  })

  it('adds the time unless it is midnight', () => {
    expect(formatShortDateTime(local(2026, 12, 12, 18))).toBe('12 дек, 18:00')
    expect(formatShortDateTime(local(2026, 12, 12, 9, 5))).toBe('12 дек, 09:05')
    expect(formatShortDateTime(local(2026, 12, 12))).toBe('12 дек')
  })
})

describe('DeadlineLabel', () => {
  it('shows a future deadline with a calendar icon and time', () => {
    const { container } = render(<DeadlineLabel status="todo" deadline={local(2026, 12, 12, 18)} now={NOW} />)
    expect(screen.getByText('12 дек, 18:00')).toBeTruthy()
    expect(container.querySelector('svg.lucide-calendar')).not.toBeNull()
    expect(container.firstElementChild?.className).toContain('text-ink-60')
  })

  it('shows only the date for a midnight deadline', () => {
    render(<DeadlineLabel status="in_progress" deadline={local(2026, 12, 12)} now={NOW} />)
    expect(screen.getByText('12 дек')).toBeTruthy()
  })

  it('marks an overdue open task in red with an alarm clock', () => {
    const { container } = render(<DeadlineLabel status="todo" deadline={local(2026, 11, 5, 18)} now={NOW} />)
    expect(screen.getByText('Просрочено · 5 ноя')).toBeTruthy()
    expect(container.querySelector('svg.lucide-alarm-clock')).not.toBeNull()
    expect(container.firstElementChild?.className).toContain('text-brand-red')
  })

  it('shows "Без срока" with a grey calendar icon', () => {
    const { container } = render(<DeadlineLabel status="todo" deadline={null} now={NOW} />)
    expect(screen.getByText('Без срока')).toBeTruthy()
    expect(container.querySelector('svg.lucide-calendar')).not.toBeNull()
  })

  it('shows the closing date of a done task', () => {
    render(<DeadlineLabel status="done" deadline={local(2026, 11, 1)} completedAt={local(2026, 11, 7, 15)} now={NOW} />)
    expect(screen.getByText('Закрыто 7 ноя')).toBeTruthy()
    expect(screen.queryByText(/Просрочено/)).toBeNull()
  })

  it('falls back to "Закрыто" without completedAt', () => {
    render(<DeadlineLabel status="done" deadline={null} now={NOW} />)
    expect(screen.getByText('Закрыто')).toBeTruthy()
  })
})
