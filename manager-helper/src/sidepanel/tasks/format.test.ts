import { describe, expect, it } from 'vitest'
import { formatLocalDeadline, quickDeadlines } from './format'

describe('quickDeadlines', () => {
  it('gives today 18:00, tomorrow 10:00 and the coming Monday 10:00', () => {
    // Tuesday
    expect(quickDeadlines(new Date(2026, 10, 10, 9, 30))).toEqual({
      today: '2026-11-10T18:00',
      tomorrow: '2026-11-11T10:00',
      nextMonday: '2026-11-16T10:00',
    })
  })

  it('crosses the end of the month and the year', () => {
    expect(quickDeadlines(new Date(2026, 10, 30, 12, 0)).tomorrow).toBe('2026-12-01T10:00')
    // Thursday, Dec 31
    expect(quickDeadlines(new Date(2026, 11, 31, 12, 0))).toEqual({
      today: '2026-12-31T18:00',
      tomorrow: '2027-01-01T10:00',
      nextMonday: '2027-01-04T10:00',
    })
  })

  it('takes tomorrow on a Sunday and the Monday a week away on a Monday', () => {
    expect(quickDeadlines(new Date(2026, 10, 15, 12, 0)).nextMonday).toBe('2026-11-16T10:00')
    expect(quickDeadlines(new Date(2026, 10, 16, 12, 0)).nextMonday).toBe('2026-11-23T10:00')
  })
})

describe('formatLocalDeadline', () => {
  const now = new Date(2026, 10, 10, 9, 0)
  it('names today and tomorrow and dates the rest', () => {
    expect(formatLocalDeadline('2026-11-10T18:00', now)).toBe('Сегодня, 18:00')
    expect(formatLocalDeadline('2026-11-11T10:00', now)).toBe('Завтра, 10:00')
    expect(formatLocalDeadline('2026-11-16T10:00', now)).toMatch(/16 ноя/)
    expect(formatLocalDeadline('', now)).toBe('')
  })
})
