import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './format-relative-time'

const NOW = new Date(2026, 10, 10, 12, 0, 0)

function ago(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString()
}

function onDay(year: number, month: number, day: number): string {
  return new Date(year, month, day, 9, 30).toISOString()
}

describe('formatRelativeTime: short mode', () => {
  it('shows "только что" for less than a minute', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 20_000).toISOString(), NOW, 'short')).toBe(
      'только что',
    )
  })

  it('shows minutes and hours without "назад"', () => {
    expect(formatRelativeTime(ago(2), NOW, 'short')).toBe('2 мин')
    expect(formatRelativeTime(ago(35), NOW, 'short')).toBe('35 мин')
    expect(formatRelativeTime(ago(60), NOW, 'short')).toBe('1 ч')
    expect(formatRelativeTime(ago(5 * 60 + 10), NOW, 'short')).toBe('5 ч')
  })

  it('shows "вчера" for the previous calendar day', () => {
    expect(formatRelativeTime(onDay(2026, 10, 9), NOW, 'short')).toBe('вчера')
  })

  it('shows days within a week with the Russian plural', () => {
    expect(formatRelativeTime(onDay(2026, 10, 7), NOW, 'short')).toBe('3 дня')
    expect(formatRelativeTime(onDay(2026, 10, 5), NOW, 'short')).toBe('5 дней')
  })

  it('shows the date for older notifications', () => {
    expect(formatRelativeTime(onDay(2026, 9, 12), NOW, 'short')).toBe('12 окт')
  })

  it('adds the year for a past year', () => {
    expect(formatRelativeTime(onDay(2025, 9, 12), NOW, 'short')).toBe('12 окт 2025')
  })
})

describe('formatRelativeTime: full mode', () => {
  it('adds "назад" to minutes, hours and days', () => {
    expect(formatRelativeTime(ago(2), NOW, 'full')).toBe('2 мин назад')
    expect(formatRelativeTime(ago(60), NOW, 'full')).toBe('1 ч назад')
    expect(formatRelativeTime(onDay(2026, 10, 7), NOW, 'full')).toBe('3 дня назад')
  })

  it('keeps "вчера" and the date as is', () => {
    expect(formatRelativeTime(onDay(2026, 10, 9), NOW, 'full')).toBe('вчера')
    expect(formatRelativeTime(onDay(2026, 9, 12), NOW, 'full')).toBe('12 окт')
  })
})
