import { describe, expect, it } from 'vitest'
import { groupByDay } from './group-by-day'

const now = new Date(2026, 10, 20, 15, 0)

describe('groupByDay', () => {
  it('today', () => {
    expect(groupByDay(new Date(2026, 10, 20, 1, 0).toISOString(), now)).toBe('Сегодня')
  })
  it('yesterday', () => {
    expect(groupByDay(new Date(2026, 10, 19, 23, 0).toISOString(), now)).toBe('Вчера')
  })
  it('earlier', () => {
    expect(groupByDay(new Date(2026, 10, 12, 10, 0).toISOString(), now)).toBe('Ранее')
  })
  it('future timestamps count as today', () => {
    expect(groupByDay(new Date(2026, 10, 21, 10, 0).toISOString(), now)).toBe('Сегодня')
  })
})
