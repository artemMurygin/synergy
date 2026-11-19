import { describe, expect, it } from 'vitest'
import { formatBadgeCount } from './format-badge-count'

describe('formatBadgeCount', () => {
  it('hides zero and negatives', () => {
    expect(formatBadgeCount(0)).toBe('')
    expect(formatBadgeCount(-1)).toBe('')
  })
  it('shows exact counts up to 99 and 99+ beyond', () => {
    expect(formatBadgeCount(3)).toBe('3')
    expect(formatBadgeCount(99)).toBe('99')
    expect(formatBadgeCount(100)).toBe('99+')
    expect(formatBadgeCount(150)).toBe('99+')
  })
})
