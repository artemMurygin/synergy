import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '@/stores/chat.store'
import { useUiStore } from '@/stores/ui.store'
import { authenticatedSnapshot, createQueryClient, createWrapper, installBridgeMock } from './auth-test-utils'
import { useSessionStore } from './session.store'
import { useSessionReset } from './session-reset'
import { act } from 'react'

describe('useSessionReset', () => {
  beforeEach(() => {
    installBridgeMock()
    useSessionStore.setState(useSessionStore.getInitialState())
    useChatStore.getState().setActiveThread('t1')
    useUiStore.setState({ dark: true })
  })

  function setup() {
    const client = createQueryClient()
    client.setQueryData(['threads'], [{ id: 't1' }])
    renderHook(() => useSessionReset(), { wrapper: createWrapper(client) })
    return client
  }

  it('clears query cache and chat store on transition to unauthenticated', () => {
    const client = setup()
    act(() => useSessionStore.getState().setSnapshot(authenticatedSnapshot))
    expect(client.getQueryData(['threads'])).toBeDefined()
    act(() => useSessionStore.getState().setSnapshot({ state: 'unauthenticated', user: null }))
    expect(client.getQueryData(['threads'])).toBeUndefined()
    expect(useChatStore.getState().activeThreadId).toBeNull()
  })

  it('keeps appearance settings', () => {
    setup()
    act(() => useSessionStore.getState().setSnapshot(authenticatedSnapshot))
    act(() => useSessionStore.getState().setSnapshot({ state: 'unauthenticated', user: null }))
    expect(useUiStore.getState().dark).toBe(true)
  })

  it('does not clear on other transitions', () => {
    const client = setup()
    act(() => useSessionStore.getState().setSnapshot(authenticatedSnapshot))
    act(() => useSessionStore.getState().setSnapshot({ state: 'connectionError', user: null }))
    act(() => useSessionStore.getState().setSnapshot({ state: 'mustChangePassword', user: authenticatedSnapshot.user }))
    expect(client.getQueryData(['threads'])).toBeDefined()
    expect(useChatStore.getState().activeThreadId).toBe('t1')
  })

  it('does not clear while staying unauthenticated or on first snapshot', () => {
    const client = setup()
    act(() => useSessionStore.getState().setSnapshot(authenticatedSnapshot))
    act(() => useSessionStore.getState().setSnapshot({ state: 'unauthenticated', user: null }))
    client.setQueryData(['threads'], [{ id: 't2' }])
    act(() => useSessionStore.getState().setSnapshot({ state: 'unauthenticated', user: null, warning: 'x' }))
    expect(client.getQueryData(['threads'])).toBeDefined()
  })

  it('stops reacting after unmount', () => {
    const client = createQueryClient()
    client.setQueryData(['threads'], [1])
    const { unmount } = renderHook(() => useSessionReset(), { wrapper: createWrapper(client) })
    act(() => useSessionStore.getState().setSnapshot(authenticatedSnapshot))
    unmount()
    act(() => useSessionStore.getState().setSnapshot({ state: 'unauthenticated', user: null }))
    expect(client.getQueryData(['threads'])).toBeDefined()
  })
})
