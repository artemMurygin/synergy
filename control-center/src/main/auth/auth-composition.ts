import { AuthService } from './application/auth-service'
import type { TokenVaultPort } from './application/token-vault.port'
import { AuthApiClient, type FetchPort } from './infrastructure/auth-api-client'

interface AuthServiceOptions {
  backendUrl: string
  fetchFn: FetchPort
  vault: TokenVaultPort
}

export function createAuthService({ backendUrl, fetchFn, vault }: AuthServiceOptions): AuthService {
  return new AuthService({ api: new AuthApiClient(backendUrl, fetchFn), vault })
}
