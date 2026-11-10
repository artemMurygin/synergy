import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import { logout } from './auth.api'

export interface LogoutResult {
  serverRevoked: boolean
}

export function useLogout(): UseMutationResult<LogoutResult, Error, void> {
  return useMutation<LogoutResult, Error, void>({ mutationFn: () => logout() })
}
