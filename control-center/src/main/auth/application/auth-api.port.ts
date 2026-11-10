import type { AccessToken } from '../domain/access-token'
import type { RefreshToken } from '../domain/refresh-token'
import type { SessionUser } from '../domain/session-snapshot'

export interface IssuedTokens {
  access: AccessToken
  refresh: RefreshToken
  mustChangePassword: boolean
}

export interface AuthApiPort {
  login(login: string, password: string): Promise<IssuedTokens>
  refresh(refreshToken: RefreshToken): Promise<IssuedTokens>
  logout(refreshToken: RefreshToken): Promise<void>
  changePassword(access: AccessToken, currentPassword: string, newPassword: string): Promise<IssuedTokens>
  getCurrentUser(access: AccessToken): Promise<SessionUser>
}
