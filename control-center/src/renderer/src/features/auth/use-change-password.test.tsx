import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { authenticatedSnapshot, createWrapper, installBridgeMock } from './auth-test-utils'
import { useChangePassword } from './use-change-password'
import { useSessionStore } from './session.store'

describe('useChangePassword', () => {
  beforeEach(() => {
    useSessionStore.setState(useSessionStore.getInitialState())
  })

  it('calls the bridge with current and new password on success', async () => {
    const mock = installBridgeMock()
    mock.changePassword.mockResolvedValue({ ok: true, snapshot: authenticatedSnapshot })
    const { result } = renderHook(() => useChangePassword(), { wrapper: createWrapper() })
    await act(async () => {
      await result.current.mutateAsync({
        currentPassword: 'old-pass',
        newPassword: 'new-pass-1',
        confirmPassword: 'new-pass-1'
      })
    })
    expect(mock.changePassword).toHaveBeenCalledWith('old-pass', 'new-pass-1')
    expect(useSessionStore.getState().snapshot).toEqual(authenticatedSnapshot)
  })

  it('does not call IPC when confirmation does not match', async () => {
    const mock = installBridgeMock()
    const { result } = renderHook(() => useChangePassword(), { wrapper: createWrapper() })
    act(() =>
      result.current.mutate({
        currentPassword: 'old-pass',
        newPassword: 'new-pass-1',
        confirmPassword: 'other'
      })
    )
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ code: 'PASSWORD_MISMATCH' })
    expect(mock.changePassword).not.toHaveBeenCalled()
  })

  it('does not call IPC when new password equals current', async () => {
    const mock = installBridgeMock()
    const { result } = renderHook(() => useChangePassword(), { wrapper: createWrapper() })
    act(() =>
      result.current.mutate({
        currentPassword: 'same-pass',
        newPassword: 'same-pass',
        confirmPassword: 'same-pass'
      })
    )
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ code: 'PASSWORD_UNCHANGED' })
    expect(mock.changePassword).not.toHaveBeenCalled()
  })

  it.each(['WRONG_PASSWORD', 'SAME_PASSWORD', 'WEAK_PASSWORD'] as const)(
    'turns %s from the bridge into a typed error',
    async (code) => {
      const mock = installBridgeMock()
      mock.changePassword.mockResolvedValue({ ok: false, code })
      const { result } = renderHook(() => useChangePassword(), { wrapper: createWrapper() })
      act(() =>
        result.current.mutate({
          currentPassword: 'old-pass',
          newPassword: 'new-pass-1',
          confirmPassword: 'new-pass-1'
        })
      )
      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toMatchObject({ code })
    }
  )
})
