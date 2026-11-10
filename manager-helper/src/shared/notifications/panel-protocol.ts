import { z } from 'zod'
import { realtimeEventSchema } from './notifications-schema'
import type { RealtimeEvent } from './notifications-schema'

export const NOTIFICATIONS_PORT_NAME = 'notifications'

export const CONNECTION_STATES = ['connecting', 'online', 'offline'] as const
export type ConnectionState = (typeof CONNECTION_STATES)[number]

const panelMessageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('event'), event: realtimeEventSchema }),
  z.object({ kind: z.literal('connection-state'), state: z.enum(CONNECTION_STATES) }),
])

export type PanelMessage = z.infer<typeof panelMessageSchema>

export function isPanelMessage(value: unknown): value is PanelMessage {
  return panelMessageSchema.safeParse(value).success
}

export function parsePanelMessage(value: unknown): PanelMessage | null {
  const parsed = panelMessageSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function eventMessage(event: RealtimeEvent): PanelMessage {
  return { kind: 'event', event }
}

export function connectionStateMessage(state: ConnectionState): PanelMessage {
  return { kind: 'connection-state', state }
}
