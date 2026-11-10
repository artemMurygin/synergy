type Handler = (...args: unknown[]) => void

export class FakeSocket {
  connected = false
  active = true
  readonly handlers = new Map<string, Handler[]>()
  connectCalls = 0
  disconnectCalls = 0

  constructor(
    readonly url: string,
    readonly options: { transports?: string[]; auth?: unknown },
  ) {}

  on = (eventName: string, handler: Handler): this => {
    this.handlers.set(eventName, [...(this.handlers.get(eventName) ?? []), handler])
    return this
  }

  off = (): this => {
    this.handlers.clear()
    return this
  }

  connect = (): this => {
    this.connectCalls += 1
    this.active = true
    return this
  }

  disconnect = (): this => {
    this.disconnectCalls += 1
    this.connected = false
    this.active = false
    return this
  }

  emit(eventName: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(eventName) ?? []) handler(...args)
  }

  simulateConnect(): void {
    this.connected = true
    this.active = true
    this.emit('connect')
  }

  simulateServerDisconnect(): void {
    this.connected = false
    this.active = false
    this.emit('disconnect', 'io server disconnect')
  }

  simulateTransportClose(): void {
    this.connected = false
    this.active = true
    this.emit('disconnect', 'transport close')
  }

  async resolveAuth(): Promise<unknown> {
    const auth = this.options.auth
    if (typeof auth !== 'function') return auth
    return new Promise((resolve) => {
      Reflect.apply(auth, undefined, [resolve])
    })
  }
}
