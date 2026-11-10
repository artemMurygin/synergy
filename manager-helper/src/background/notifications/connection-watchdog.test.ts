import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installChromeFake } from './chrome-fake.testing'
import type { ChromeFake } from './chrome-fake.testing'
import { startConnectionWatchdog } from './connection-watchdog'

let chromeFake: ChromeFake

beforeEach(() => {
  chromeFake = installChromeFake()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('connection-watchdog', () => {
  it('creates an alarm that fires every minute', () => {
    startConnectionWatchdog({
      shouldConnect: () => Promise.resolve(true),
      isAlive: () => true,
      reconnect: vi.fn(),
    })
    expect(chromeFake.alarms.create).toHaveBeenCalledWith('notifications-watchdog', {
      periodInMinutes: 1,
    })
  })

  it('reconnects when the user is signed in and there is no socket', async () => {
    const reconnect = vi.fn(() => Promise.resolve())
    startConnectionWatchdog({
      shouldConnect: () => Promise.resolve(true),
      isAlive: () => false,
      reconnect,
    })
    chromeFake.alarms.onAlarm.emit({ name: 'notifications-watchdog' })
    await vi.waitFor(() => {
      expect(reconnect).toHaveBeenCalledTimes(1)
    })
  })

  it('does nothing while the socket is alive', async () => {
    const reconnect = vi.fn(() => Promise.resolve())
    startConnectionWatchdog({
      shouldConnect: () => Promise.resolve(true),
      isAlive: () => true,
      reconnect,
    })
    chromeFake.alarms.onAlarm.emit({ name: 'notifications-watchdog' })
    await Promise.resolve()
    await Promise.resolve()
    expect(reconnect).not.toHaveBeenCalled()
  })

  it('does nothing when the user is signed out', async () => {
    const reconnect = vi.fn(() => Promise.resolve())
    startConnectionWatchdog({
      shouldConnect: () => Promise.resolve(false),
      isAlive: () => false,
      reconnect,
    })
    chromeFake.alarms.onAlarm.emit({ name: 'notifications-watchdog' })
    await Promise.resolve()
    await Promise.resolve()
    expect(reconnect).not.toHaveBeenCalled()
  })

  it('ignores other alarms', async () => {
    const reconnect = vi.fn(() => Promise.resolve())
    startConnectionWatchdog({
      shouldConnect: () => Promise.resolve(true),
      isAlive: () => false,
      reconnect,
    })
    chromeFake.alarms.onAlarm.emit({ name: 'other' })
    await Promise.resolve()
    await Promise.resolve()
    expect(reconnect).not.toHaveBeenCalled()
  })
})
