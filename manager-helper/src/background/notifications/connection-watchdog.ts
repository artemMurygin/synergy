export const WATCHDOG_ALARM_NAME = 'notifications-watchdog'
const WATCHDOG_PERIOD_MINUTES = 1

export interface ConnectionWatchdogDeps {
  shouldConnect: () => Promise<boolean>
  isAlive: () => boolean
  reconnect: () => Promise<void>
}

export function startConnectionWatchdog(deps: ConnectionWatchdogDeps): () => void {
  const handleAlarm = (alarm: chrome.alarms.Alarm): void => {
    if (alarm.name !== WATCHDOG_ALARM_NAME || deps.isAlive()) return
    void (async () => {
      if (await deps.shouldConnect()) await deps.reconnect()
    })().catch((error: unknown) => {
      console.warn('Notifications watchdog reconnect failed', error)
    })
  }
  void chrome.alarms.create(WATCHDOG_ALARM_NAME, { periodInMinutes: WATCHDOG_PERIOD_MINUTES })
  chrome.alarms.onAlarm.addListener(handleAlarm)
  return () => {
    chrome.alarms.onAlarm.removeListener(handleAlarm)
  }
}
