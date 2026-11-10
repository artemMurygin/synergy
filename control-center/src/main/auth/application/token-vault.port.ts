import type { RefreshToken } from '../domain/refresh-token'

export interface TokenVaultPort {
  save(token: RefreshToken): Promise<{ persisted: boolean }>
  load(): Promise<RefreshToken | null>
  clear(): Promise<void>
}
