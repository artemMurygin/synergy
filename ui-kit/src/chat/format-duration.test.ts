import { describe, expect, it } from 'vitest'
import { formatDuration } from './format-duration'

describe('formatDuration', () => {
  it.each([
    [400, '0,4 с'],
    [1234, '1,2 с'],
    [5000, '5,0 с'],
    [0, '0,0 с'],
    [62_000, '62,0 с'],
  ])('%i ms -> %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text)
  })

  it('is empty without a valid duration', () => {
    expect(formatDuration(undefined)).toBe('')
    expect(formatDuration(Number.NaN)).toBe('')
    expect(formatDuration(-5)).toBe('')
  })
})
