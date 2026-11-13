/** Outcome of asking the main process to open a request page in the portal. */
export type PortalOpenResult = 'opened' | 'unavailable' | 'invalid'

export interface PortalBridge {
  openRequest(requestId: string): Promise<PortalOpenResult>
}

export const PORTAL_CHANNELS = {
  openRequest: 'portal:openRequest'
} as const
