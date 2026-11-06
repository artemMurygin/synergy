const CHANNEL_NAME = 'mh-auth'
const SESSION_ENDED = { type: 'session-ended' }

type Listener = () => void

const listeners = new Set<Listener>()
let channel: BroadcastChannel | null | undefined

function notify(): void {
  for (const listener of [...listeners]) listener()
}

function getChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    if (typeof BroadcastChannel === 'undefined') {
      channel = null
    } else {
      channel = new BroadcastChannel(CHANNEL_NAME)
      channel.onmessage = (event: MessageEvent) => {
        const data: unknown = event.data
        if (
          typeof data === 'object' &&
          data !== null &&
          'type' in data &&
          data.type === 'session-ended'
        ) {
          notify()
        }
      }
    }
  }
  return channel
}

/** Tells every extension context (including this one) that the session is over. */
export function endSession(): void {
  getChannel()?.postMessage(SESSION_ENDED)
  notify()
}

export function onSessionEnded(listener: Listener): () => void {
  getChannel()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
