import { formatBadgeCount } from '@/shared/notifications/format-badge-count'

const BADGE_COLOR = '#ed131c'

export async function setUnreadBadge(unreadCount: number): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR })
  await chrome.action.setBadgeText({ text: formatBadgeCount(unreadCount) })
}

export async function clearUnreadBadge(): Promise<void> {
  await chrome.action.setBadgeText({ text: '' })
}
