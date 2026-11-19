import { describe, expect, it } from 'vitest'
import { formatSize } from './format-size'

describe('formatSize', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatSize(512)).toBe('512 Б')
    expect(formatSize(2048)).toBe('2 КБ')
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1,5 МБ')
  })
})
