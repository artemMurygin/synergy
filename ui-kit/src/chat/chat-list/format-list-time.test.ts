import { describe, expect, it } from 'vitest'
import { formatListTime, groupOf } from './format-list-time'

const now = new Date(2026, 10, 19, 15, 0)

describe('formatListTime', () => {
  it('shows the time for today, "Вчера" and the date for older chats', () => {
    expect(formatListTime(new Date(2026, 10, 19, 14, 20).toISOString(), now)).toBe('14:20')
    expect(formatListTime(new Date(2026, 10, 18, 9, 5).toISOString(), now)).toBe('Вчера')
    expect(formatListTime(new Date(2026, 10, 3, 9, 5).toISOString(), now)).toBe('3 ноября')
    expect(formatListTime(new Date(2025, 10, 3, 9, 5).toISOString(), now)).toBe('3 ноября 2025')
    expect(formatListTime('нет', now)).toBe('')
  })
})

describe('groupOf', () => {
  it('splits chats into today, yesterday and earlier', () => {
    expect(groupOf(new Date(2026, 10, 19, 1).toISOString(), now)).toBe('Сегодня')
    expect(groupOf(new Date(2026, 10, 18, 23).toISOString(), now)).toBe('Вчера')
    expect(groupOf(new Date(2026, 9, 1).toISOString(), now)).toBe('Ранее')
  })
})
