import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createWrapper, installBridgeMock } from './auth-test-utils'
import { useLogout } from './use-logout'

describe('useLogout', () => {
  it.each([true, false])('returns serverRevoked=%s from the bridge', async (serverRevoked) => {
    const mock = installBridgeMock()
    mock.logout.mockResolvedValue({ serverRevoked })
    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() })
    let outcome
    await act(async () => {
      outcome = await result.current.mutateAsync()
    })
    expect(mock.logout).toHaveBeenCalledTimes(1)
    expect(outcome).toEqual({ serverRevoked })
  })
})
