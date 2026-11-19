import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CHAT_LIST_COLLAPSED_KEY, useChatListCollapsed } from './use-chat-list-collapsed'

beforeEach(() => {
  sessionStorage.clear()
})

describe('useChatListCollapsed', () => {
  it('shows the list by default', () => {
    const { result } = renderHook(() => useChatListCollapsed())
    expect(result.current[0]).toBe(false)
  })

  it('toggles and keeps the state in sessionStorage', () => {
    const { result } = renderHook(() => useChatListCollapsed())
    act(() => {
      result.current[1]()
    })
    expect(result.current[0]).toBe(true)
    expect(sessionStorage.getItem(CHAT_LIST_COLLAPSED_KEY)).toBe('1')
    act(() => {
      result.current[1]()
    })
    expect(result.current[0]).toBe(false)
    expect(sessionStorage.getItem(CHAT_LIST_COLLAPSED_KEY)).toBe('0')
  })

  it('restores the state within the session', () => {
    sessionStorage.setItem(CHAT_LIST_COLLAPSED_KEY, '1')
    const { result } = renderHook(() => useChatListCollapsed())
    expect(result.current[0]).toBe(true)
  })
})
