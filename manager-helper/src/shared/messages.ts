export type ExtensionMessage = { type: 'PING' }

export type ExtensionResponse = { type: 'PONG'; receivedAt: number }

export function isExtensionMessage(message: unknown): message is ExtensionMessage {
  return (
    typeof message === 'object' && message !== null && 'type' in message && message.type === 'PING'
  )
}
