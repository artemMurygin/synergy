/** The part of an Electron session the permission policy needs. */
export interface PermissionSessionPort {
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: string,
      callback: (granted: boolean) => void,
      details: { requestingUrl: string; mediaTypes?: string[] }
    ) => void
  ): void
  setPermissionCheckHandler(
    handler: (
      webContents: unknown,
      permission: string,
      requestingOrigin: string,
      details: { mediaType?: string }
    ) => boolean
  ): void
}

/** The page is the app window: the dev server of the renderer or, packaged, a local file. */
function isAppOrigin(url: string, rendererUrl: string | undefined): boolean {
  try {
    const parsed = new URL(url)
    if (rendererUrl) return parsed.origin === new URL(rendererUrl).origin
    return parsed.protocol === 'file:'
  } catch {
    return false
  }
}

/**
 * Permission policy of the window: only the microphone (`media` with audio alone) of the app page is granted,
 * everything else and any foreign origin is denied.
 */
export function installMediaPermissions(session: PermissionSessionPort, rendererUrl: string | undefined): void {
  session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const types = details.mediaTypes ?? []
    const audioOnly = types.length > 0 && types.every((type) => type === 'audio')
    callback(permission === 'media' && audioOnly && isAppOrigin(details.requestingUrl, rendererUrl))
  })
  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
    return permission === 'media' && details.mediaType === 'audio' && isAppOrigin(requestingOrigin, rendererUrl)
  })
}
