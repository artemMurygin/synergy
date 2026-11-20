import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_QUICK_SEARCH } from './defaults'
import { useQuickSearchDrafts } from './use-quick-search-drafts'

describe('useQuickSearchDrafts', () => {
  it('gives the defaults for a chat without a draft', () => {
    const { result } = renderHook(() => useQuickSearchDrafts())
    expect(result.current[0]('a')).toEqual(DEFAULT_QUICK_SEARCH)
    expect(result.current[0](null)).toEqual(DEFAULT_QUICK_SEARCH)
  })

  it('keeps a draft per chat: back in the chat restores it, another chat has the defaults', () => {
    const { result } = renderHook(() => useQuickSearchDrafts())
    const draft = { ...DEFAULT_QUICK_SEARCH, level: 'master' as const, count: 10 }
    act(() => {
      result.current[1]('a', draft)
    })
    expect(result.current[0]('a')).toEqual(draft)
    expect(result.current[0]('b')).toEqual(DEFAULT_QUICK_SEARCH)
    act(() => {
      result.current[1]('b', { ...DEFAULT_QUICK_SEARCH, stateSupport: true })
    })
    expect(result.current[0]('a')).toEqual(draft)
  })

  it('keeps the draft of the chat that does not exist yet apart from the chats', () => {
    const { result } = renderHook(() => useQuickSearchDrafts())
    act(() => {
      result.current[1](null, { ...DEFAULT_QUICK_SEARCH, count: 3 })
    })
    expect(result.current[0](null).count).toBe(3)
    expect(result.current[0]('a')).toEqual(DEFAULT_QUICK_SEARCH)
  })
})
