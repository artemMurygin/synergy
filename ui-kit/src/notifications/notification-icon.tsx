import type { ReactNode } from 'react'
import { AlarmClock, AudioLines, Bell, CircleAlert, FileCheck, ListChecks } from '../icons'

export type NotificationIconName = 'list-checks' | 'alarm-clock' | 'audio-lines' | 'file-check' | 'circle-alert' | 'bell'

const ICON_BY_TYPE: Record<string, NotificationIconName> = {
  task: 'list-checks',
  deadline: 'alarm-clock',
  'transcript-ready': 'audio-lines',
  'request-accepted': 'file-check',
  error: 'circle-alert',
}

/** Имя иконки по типу уведомления; неизвестный тип — колокольчик. */
export function notificationIcon(type: string): NotificationIconName {
  return ICON_BY_TYPE[type] ?? 'bell'
}

const NODE_BY_NAME: Record<NotificationIconName, ReactNode> = {
  'list-checks': <ListChecks />,
  'alarm-clock': <AlarmClock />,
  'audio-lines': <AudioLines />,
  'file-check': <FileCheck />,
  'circle-alert': <CircleAlert />,
  bell: <Bell />,
}

/** Иконка типа уведомления для `NotificationView.icon`. */
export function notificationIconNode(type: string): ReactNode {
  return NODE_BY_NAME[notificationIcon(type)]
}
