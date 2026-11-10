import { describe, expect, it } from 'vitest'
import { formatFullDateTime, formatRelativeDateTime } from './task-dates'

// local-time dates keep the results independent of the time zone
const at = (y: number, m: number, d: number, h: number, min: number): string => new Date(y, m, d, h, min).toISOString()
const NOW = new Date(2026, 10, 10, 18, 0)

describe('formatFullDateTime', () => {
  it('prints the day, genitive month, year and time', () => {
    expect(formatFullDateTime(at(2026, 11, 12, 18, 0))).toBe('12 декабря 2026, 18:00')
    expect(formatFullDateTime(at(2027, 0, 5, 9, 5))).toBe('5 января 2027, 09:05')
  })
})

describe('formatRelativeDateTime', () => {
  it('says today and yesterday', () => {
    expect(formatRelativeDateTime(at(2026, 10, 10, 14, 20), NOW)).toBe('сегодня, 14:20')
    expect(formatRelativeDateTime(at(2026, 10, 9, 14, 20), NOW)).toBe('вчера, 14:20')
  })

  it('prints older dates without the current year', () => {
    expect(formatRelativeDateTime(at(2026, 10, 8, 14, 20), NOW)).toBe('8 ноября, 14:20')
    expect(formatRelativeDateTime(at(2025, 10, 12, 14, 20), NOW)).toBe('12 ноября 2025, 14:20')
  })

  it('handles yesterday across a month boundary', () => {
    expect(formatRelativeDateTime(at(2026, 10, 30, 23, 0), new Date(2026, 11, 1, 1, 0))).toBe('вчера, 23:00')
  })
})
