import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useViewportWidth } from './use-viewport-width'

describe('useViewportWidth', () => {
  it('returns the window width and tracks resize', () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true, writable: true })
    const { result } = renderHook(() => useViewportWidth())
    expect(result.current).toBe(500)
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 700, configurable: true, writable: true })
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(700)
  })
})
