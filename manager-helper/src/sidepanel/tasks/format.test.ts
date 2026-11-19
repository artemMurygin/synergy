import { describe, expect, it } from 'vitest'
import { formatDay } from './format'

describe('formatDay', () => {
  it('gives the day and the short month without a dot', () => {
    expect(formatDay('2026-11-05T12:00:00.000Z')).toBe('5 нояб')
  })
})
