import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { USER_MESSAGE_SAVED_EVENT, useServerMessageIds } from './use-server-message-ids'

const saved = (messageId: string) => ({ name: USER_MESSAGE_SAVED_EVENT, value: { messageId } })

describe('useServerMessageIds', () => {
  it('knows nothing about a local message until the event comes', () => {
    const { result } = renderHook(() => useServerMessageIds())
    expect(result.current.serverIdOf('local-1')).toBeUndefined()
    expect(result.current.isEditable('local-1')).toBe(false)
  })

  it('maps the local id to the server id by the CUSTOM event and makes it editable', () => {
    const { result } = renderHook(() => useServerMessageIds())
    act(() => {
      result.current.onCustomEvent(saved('17'), 'local-1')
    })
    expect(result.current.serverIdOf('local-1')).toBe('17')
    expect(result.current.isEditable('local-1')).toBe(true)
  })

  it('ignores other events and malformed values', () => {
    const { result } = renderHook(() => useServerMessageIds())
    act(() => {
      result.current.onCustomEvent({ name: 'other', value: { messageId: '1' } }, 'a')
      result.current.onCustomEvent({ name: USER_MESSAGE_SAVED_EVENT, value: {} }, 'b')
    })
    expect(result.current.serverIdOf('a')).toBeUndefined()
    expect(result.current.serverIdOf('b')).toBeUndefined()
  })

  it('takes ids from the history and keeps editable: false out of editing', () => {
    const { result } = renderHook(() => useServerMessageIds())
    act(() => {
      result.current.setFromHistory([
        { id: '1', role: 'user', editable: false },
        { id: '2', role: 'assistant' },
        { id: '3', role: 'user', editable: true },
      ])
    })
    expect(result.current.serverIdOf('3')).toBe('3')
    expect(result.current.isEditable('1')).toBe(false)
    expect(result.current.isEditable('3')).toBe(true)
  })

  it('forgets the old history on the next setFromHistory but keeps event ids', () => {
    const { result } = renderHook(() => useServerMessageIds())
    act(() => {
      result.current.onCustomEvent(saved('9'), 'local-9')
      result.current.setFromHistory([{ id: '1', role: 'user', editable: false }])
    })
    act(() => {
      result.current.setFromHistory([{ id: '1', role: 'user', editable: true }])
    })
    expect(result.current.isEditable('1')).toBe(true)
    expect(result.current.serverIdOf('local-9')).toBe('9')
  })
})
