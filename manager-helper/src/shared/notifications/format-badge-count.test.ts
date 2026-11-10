import { describe, expect, it } from 'vitest'
import { formatBadgeCount } from './format-badge-count'

describe('formatBadgeCount', () => {
  it('is empty for zero', () => {
    expect(formatBadgeCount(0)).toBe('')
  })

  it('is empty for a negative count', () => {
    expect(formatBadgeCount(-1)).toBe('')
  })

  it('shows the count up to 99', () => {
    expect(formatBadgeCount(1)).toBe('1')
    expect(formatBadgeCount(99)).toBe('99')
  })

  it('shows 99+ above 99', () => {
    expect(formatBadgeCount(100)).toBe('99+')
    expect(formatBadgeCount(1500)).toBe('99+')
  })
})
