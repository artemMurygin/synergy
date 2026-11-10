import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './format-relative-time'

const NOW = new Date(2026, 10, 10, 15, 0, 0)
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

describe('formatRelativeTime', () => {
  it('says «только что» for less than a minute', () => {
    expect(formatRelativeTime(ago(20_000), NOW)).toBe('только что')
  })

  it('counts minutes within the hour', () => {
    expect(formatRelativeTime(ago(2 * MINUTE_MS), NOW)).toBe('2 мин назад')
    expect(formatRelativeTime(ago(35 * MINUTE_MS), NOW)).toBe('35 мин назад')
  })

  it('counts hours within a day', () => {
    expect(formatRelativeTime(ago(HOUR_MS), NOW)).toBe('1 ч назад')
    expect(formatRelativeTime(ago(14 * HOUR_MS), NOW)).toBe('14 ч назад')
  })

  it('says «вчера» for the previous calendar day older than a day', () => {
    expect(formatRelativeTime(new Date(2026, 10, 9, 10, 0).toISOString(), NOW)).toBe('вчера')
  })

  it('counts days within a week with the right plural', () => {
    expect(formatRelativeTime(new Date(2026, 10, 7, 12, 0).toISOString(), NOW)).toBe('3 дня назад')
    expect(formatRelativeTime(new Date(2026, 10, 5, 12, 0).toISOString(), NOW)).toBe('5 дней назад')
  })

  it('shows a short date for older ones and adds the year for past years', () => {
    expect(formatRelativeTime(new Date(2026, 9, 12, 12, 0).toISOString(), NOW)).toBe('12 окт')
    expect(formatRelativeTime(new Date(2025, 8, 29, 12, 0).toISOString(), NOW)).toBe('29 сен 2025')
  })

  it('returns an empty string for an invalid date', () => {
    expect(formatRelativeTime('not a date', NOW)).toBe('')
  })
})
