import { app, BrowserWindow, dialog, ipcMain, net, safeStorage, shell } from 'electron'
import { join } from 'path'
import type { AuthService } from './auth/application/auth-service'
import { createAuthService } from './auth/auth-composition'
import { TokenVault } from './auth/infrastructure/token-vault'
import { registerAuthIpc } from './auth/interface/auth-ipc'
import { getBackendUrl } from './backend-config'
import { install as installCcApi, registerScheme as registerCcApiScheme } from './cc-api-protocol'

registerCcApiScheme()

function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Block navigation away from the app (dev server or bundled file)
  win.webContents.on('will-navigate', (event, url) => {
    const appUrl = process.env['ELECTRON_RENDERER_URL']
    if (!appUrl || new URL(url).origin !== new URL(appUrl).origin) event.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  let auth: AuthService
  try {
    const backendUrl = getBackendUrl()
    auth = createAuthService({
      backendUrl,
      fetchFn: (url, init) => net.fetch(url, init),
      vault: new TokenVault(safeStorage, join(app.getPath('userData'), 'refresh-token.bin'))
    })
    registerAuthIpc({ ipcMain, auth, getWindows: () => BrowserWindow.getAllWindows() })
    installCcApi(backendUrl, auth)
  } catch (error) {
    // A bad CC_BACKEND_URL must not leave a windowless process behind
    dialog.showErrorBox('Control Center', error instanceof Error ? error.message : String(error))
    app.quit()
    return
  }
  createWindow()
  auth.restore().catch(() => undefined)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
