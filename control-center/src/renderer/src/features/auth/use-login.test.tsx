import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { authenticatedSnapshot, createWrapper, installBridgeMock } from './auth-test-utils'
import { useLogin } from './use-login'
import { useSessionStore } from './session.store'

describe('useLogin', () => {
  beforeEach(() => {
    useSessionStore.setState(useSessionStore.getInitialState())
  })

  it('calls the bridge and resolves with the snapshot on success', async () => {
    const mock = installBridgeMock()
    mock.login.mockResolvedValue({ ok: true, snapshot: authenticatedSnapshot })
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() })
    let snapshot
    await act(async () => {
      snapshot = await result.current.mutateAsync({ login: 'admin', password: 'secret' })
    })
    expect(mock.login).toHaveBeenCalledWith('admin', 'secret')
    expect(snapshot).toEqual(authenticatedSnapshot)
    expect(useSessionStore.getState().snapshot).toEqual(authenticatedSnapshot)
  })

  it('turns INVALID_CREDENTIALS into a typed error', async () => {
    const mock = installBridgeMock()
    mock.login.mockResolvedValue({ ok: false, code: 'INVALID_CREDENTIALS' })
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() })
    act(() => result.current.mutate({ login: 'admin', password: 'bad' }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(result.current.error?.retryAfterSec).toBeUndefined()
    expect(typeof result.current.error).not.toBe('string')
    expect(useSessionStore.getState().snapshot).toEqual(useSessionStore.getInitialState().snapshot)
  })

  it('keeps retryAfterSec for RATE_LIMITED', async () => {
    const mock = installBridgeMock()
    mock.login.mockResolvedValue({ ok: false, code: 'RATE_LIMITED', retryAfterSec: 30 })
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() })
    act(() => result.current.mutate({ login: 'admin', password: 'bad' }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ code: 'RATE_LIMITED', retryAfterSec: 30 })
  })
})
