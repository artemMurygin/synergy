import { vi } from 'vitest'
import type { NotificationDto } from '@/shared/notifications/notifications-schema'

type AnyListener = (...args: never[]) => unknown

export class FakeEvent<TListener extends AnyListener> {
  readonly listeners: TListener[] = []

  addListener = (listener: TListener): void => {
    this.listeners.push(listener)
  }

  removeListener = (listener: TListener): void => {
    const index = this.listeners.indexOf(listener)
    if (index >= 0) this.listeners.splice(index, 1)
  }

  emit(...args: Parameters<TListener>): void {
    for (const listener of [...this.listeners]) listener(...args)
  }
}

function fakeStorageArea() {
  const store: Record<string, unknown> = {}
  return {
    store,
    get: vi.fn((key: string) => Promise.resolve(key in store ? { [key]: store[key] } : {})),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(store, items)
      return Promise.resolve()
    }),
    remove: vi.fn((key: string) => {
      Reflect.deleteProperty(store, key)
      return Promise.resolve()
    }),
  }
}

export interface FakePortMessageListener {
  (message: unknown): void
}

export class FakePort {
  readonly posted: unknown[] = []
  readonly onDisconnect = new FakeEvent<() => void>()
  readonly onMessage = new FakeEvent<FakePortMessageListener>()

  constructor(readonly name: string) {}

  postMessage = (message: unknown): void => {
    this.posted.push(message)
  }

  disconnect = (): void => {
    this.onDisconnect.emit()
  }
}

export function createChromeFake() {
  const shownNotifications = new Map<string, unknown>()
  return {
    shownNotifications,
    runtime: {
      onConnect: new FakeEvent<(port: FakePort) => void>(),
      onStartup: new FakeEvent<() => void>(),
      onInstalled: new FakeEvent<() => void>(),
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      connect: vi.fn((info: { name: string }) => new FakePort(info.name)),
      openOptionsPage: vi.fn(),
    },
    storage: {
      local: fakeStorageArea(),
      sync: fakeStorageArea(),
      session: fakeStorageArea(),
      onChanged: new FakeEvent<(changes: Record<string, unknown>, areaName: string) => void>(),
    },
    notifications: {
      create: vi.fn((id: string, options: unknown) => {
        shownNotifications.set(id, options)
        return Promise.resolve(id)
      }),
      clear: vi.fn((id: string) => {
        const wasShown = shownNotifications.delete(id)
        return Promise.resolve(wasShown)
      }),
      getAll: vi.fn(() =>
        Promise.resolve(Object.fromEntries([...shownNotifications.keys()].map((id) => [id, true]))),
      ),
      onClicked: new FakeEvent<(notificationId: string) => void>(),
    },
    action: {
      setBadgeText: vi.fn<(details: { text: string }) => Promise<void>>(() => Promise.resolve()),
      setBadgeBackgroundColor: vi.fn<(details: { color: string }) => Promise<void>>(() =>
        Promise.resolve(),
      ),
    },
    sidePanel: {
      open: vi.fn<(options: { windowId: number }) => Promise<void>>(() => Promise.resolve()),
    },
    windows: {
      WINDOW_ID_NONE: -1,
      WINDOW_ID_CURRENT: -2,
      onFocusChanged: new FakeEvent<(windowId: number) => void>(),
      getLastFocused: vi.fn(() => Promise.resolve({ id: 7 })),
      update: vi.fn<(windowId: number, info: { focused: boolean }) => Promise<{ id: number }>>(() =>
        Promise.resolve({ id: 7 }),
      ),
    },
    tabs: {
      create: vi.fn<(properties: { url: string }) => Promise<{ id: number }>>(() =>
        Promise.resolve({ id: 1 }),
      ),
    },
    alarms: {
      create: vi.fn<(name: string, info: { periodInMinutes: number }) => Promise<void>>(() =>
        Promise.resolve(),
      ),
      onAlarm: new FakeEvent<(alarm: { name: string }) => void>(),
    },
  }
}

export type ChromeFake = ReturnType<typeof createChromeFake>

export function installChromeFake(): ChromeFake {
  const fake = createChromeFake()
  vi.stubGlobal('chrome', fake)
  return fake
}

export function makeRequestNotification(id: string, createdAt: string, requestId: string) {
  return {
    ...makeNotification(id, createdAt),
    type: 'request.status-changed',
    title: 'Статус заявки изменён',
    body: 'Навык запущен',
    target: { type: 'request', id: requestId },
  }
}

export function makeNotification(
  id: string,
  createdAt: string,
  overrides: Partial<{ title: string; body: string; taskId: string; target: { type: string; id: string } }> = {},
): NotificationDto {
  return {
    id,
    type: 'task.assigned',
    title: overrides.title ?? `Уведомление ${id}`,
    body: overrides.body ?? 'anna назначила вам задачу',
    target: overrides.target ?? { type: 'task', id: overrides.taskId ?? `task-${id}` },
    actorId: 'u2',
    createdAt,
    readAt: null,
  }
}
