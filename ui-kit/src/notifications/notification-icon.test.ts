import { describe, expect, it } from 'vitest'
import { notificationIcon } from './notification-icon'

describe('notificationIcon', () => {
  it.each([
    ['task', 'list-checks'],
    ['deadline', 'alarm-clock'],
    ['transcript-ready', 'audio-lines'],
    ['request-accepted', 'file-check'],
    ['error', 'circle-alert'],
    ['something-else', 'bell'],
  ])('%s -> %s', (type, icon) => {
    expect(notificationIcon(type)).toBe(icon)
  })
})
