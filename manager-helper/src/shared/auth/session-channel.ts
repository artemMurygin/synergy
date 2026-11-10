const CHANNEL_NAME = 'mh-auth'

type SessionSignal = 'session-started' | 'session-ended'
type Listener = () => void

const listenersBySignal: Record<SessionSignal, Set<Listener>> = {
  'session-started': new Set(),
  'session-ended': new Set(),
}
let channel: BroadcastChannel | null | undefined

function notify(signal: SessionSignal): void {
  for (const listener of [...listenersBySignal[signal]]) listener()
}

function readSignal(data: unknown): SessionSignal | null {
  if (typeof data !== 'object' || data === null || !('type' in data)) return null
  if (data.type === 'session-started' || data.type === 'session-ended') return data.type
  return null
}

function getChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    if (typeof BroadcastChannel === 'undefined') {
      channel = null
    } else {
      channel = new BroadcastChannel(CHANNEL_NAME)
      channel.onmessage = (event: MessageEvent) => {
        const signal = readSignal(event.data)
        if (signal !== null) notify(signal)
      }
    }
  }
  return channel
}

function send(signal: SessionSignal): void {
  getChannel()?.postMessage({ type: signal })
  notify(signal)
}

function subscribe(signal: SessionSignal, listener: Listener): () => void {
  getChannel()
  listenersBySignal[signal].add(listener)
  return () => {
    listenersBySignal[signal].delete(listener)
  }
}

/** Tells every extension context (including this one) that the session is over. */
export function endSession(): void {
  send('session-ended')
}

export function onSessionEnded(listener: Listener): () => void {
  return subscribe('session-ended', listener)
}

export function startSession(): void {
  send('session-started')
}

export function onSessionStarted(listener: Listener): () => void {
  return subscribe('session-started', listener)
}
