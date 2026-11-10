import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import type { SessionSnapshotView } from '../../../../preload/auth-bridge'
import { AuthError, changePassword } from './auth.api'
import { useSessionStore } from './session.store'

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

async function submit(input: ChangePasswordInput): Promise<SessionSnapshotView> {
  if (input.newPassword !== input.confirmPassword) throw new AuthError('PASSWORD_MISMATCH')
  if (input.newPassword === input.currentPassword) throw new AuthError('PASSWORD_UNCHANGED')
  return changePassword(input.currentPassword, input.newPassword)
}

export function useChangePassword(): UseMutationResult<
  SessionSnapshotView,
  AuthError,
  ChangePasswordInput
> {
  return useMutation<SessionSnapshotView, AuthError, ChangePasswordInput>({
    mutationFn: submit,
    onSuccess: (snapshot) => useSessionStore.getState().setSnapshot(snapshot)
  })
}
