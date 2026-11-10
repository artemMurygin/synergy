import { isAuthError } from '../domain/auth-error'
import type { SessionSnapshot } from '../domain/session-snapshot'
import type { AuthActionResult, SessionSnapshotView } from '../../../preload/auth-bridge'

const MAX_INPUT_LENGTH = 256

export interface AuthSessionPort {
  login(login: string, password: string): Promise<SessionSnapshot>
  changePassword(currentPassword: string, newPassword: string): Promise<SessionSnapshot>
  logout(): Promise<{ serverRevoked: boolean }>
  restore(): Promise<void>
  getSnapshot(): SessionSnapshot
  onChange(listener: (snapshot: SessionSnapshot) => void): () => void
}

export interface IpcMainPort {
  handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void
}

export interface WindowPort {
  webContents: { send(channel: string, ...args: unknown[]): void }
}

interface AuthIpcDependencies {
  ipcMain: IpcMainPort
  auth: AuthSessionPort
  getWindows: () => readonly WindowPort[]
}

function toView(snapshot: SessionSnapshot): SessionSnapshotView {
  const view: SessionSnapshotView = {
    state: snapshot.state,
    user: snapshot.user ? { id: snapshot.user.id, login: snapshot.user.login } : null
  }
  if (snapshot.warning !== undefined) view.warning = snapshot.warning
  if (snapshot.retryAfterSec !== undefined) view.retryAfterSec = snapshot.retryAfterSec
  return view
}

function isValidInput(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_INPUT_LENGTH
}

function toFailure(error: unknown): AuthActionResult {
  if (isAuthError(error)) {
    return error.retryAfterSec === undefined
      ? { ok: false, code: error.code }
      : { ok: false, code: error.code, retryAfterSec: error.retryAfterSec }
  }
  return { ok: false, code: 'SERVER_ERROR' }
}

async function runAction(action: () => Promise<SessionSnapshot>): Promise<AuthActionResult> {
  try {
    return { ok: true, snapshot: toView(await action()) }
  } catch (error) {
    return toFailure(error)
  }
}

export function registerAuthIpc({ ipcMain, auth, getWindows }: AuthIpcDependencies): () => void {
  ipcMain.handle('auth:login', async (_event, login, password) => {
    if (!isValidInput(login) || !isValidInput(password)) {
      return { ok: false, code: 'INVALID_INPUT' }
    }
    return runAction(() => auth.login(login, password))
  })

  ipcMain.handle('auth:changePassword', async (_event, currentPassword, newPassword) => {
    if (!isValidInput(currentPassword) || !isValidInput(newPassword)) {
      return { ok: false, code: 'INVALID_INPUT' }
    }
    return runAction(() => auth.changePassword(currentPassword, newPassword))
  })

  ipcMain.handle('auth:logout', async () => {
    try {
      const { serverRevoked } = await auth.logout()
      return { serverRevoked }
    } catch {
      return { serverRevoked: false }
    }
  })

  ipcMain.handle('auth:retryRestore', async () => {
    try {
      await auth.restore()
    } catch {
      return undefined
    }
    return undefined
  })

  ipcMain.handle('auth:getState', () => toView(auth.getSnapshot()))

  return auth.onChange((snapshot) => {
    const view = toView(snapshot)
    for (const window of getWindows()) window.webContents.send('session:changed', view)
  })
}
