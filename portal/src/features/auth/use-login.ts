import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import type { Profile } from '@/lib/schemas'
import { login, type AuthError } from './auth.api'

export interface LoginInput {
  login: string
  password: string
}

export function useLogin(): UseMutationResult<Profile, AuthError, LoginInput> {
  return useMutation<Profile, AuthError, LoginInput>({
    mutationFn: (input) => login(input.login, input.password)
  })
}
