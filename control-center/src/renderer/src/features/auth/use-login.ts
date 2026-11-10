import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import type { SessionSnapshotView } from '../../../../preload/auth-bridge'
import { AuthError, login } from './auth.api'
import { useSessionStore } from './session.store'

export interface LoginInput {
  login: string
  password: string
}

export function useLogin(): UseMutationResult<SessionSnapshotView, AuthError, LoginInput> {
  return useMutation<SessionSnapshotView, AuthError, LoginInput>({
    mutationFn: (input) => login(input.login, input.password),
    onSuccess: (snapshot) => useSessionStore.getState().setSnapshot(snapshot)
  })
}
