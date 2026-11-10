import type { NotificationDto, NotificationPage } from '@/shared/notifications/notifications-schema'
import { isCreatedAfter } from './seen-store'
import type { SeenStore } from './seen-store'
import type { SystemNotifier } from './system-notifier'

const MAX_SEPARATE_NOTIFICATIONS = 3

export interface MissedNotificationsDeps {
  listUnread: () => Promise<NotificationPage>
  seen: SeenStore
  notifier: SystemNotifier
}

function newest(items: readonly NotificationDto[]): string | null {
  let latest: string | null = null
  for (const notification of items) {
    if (latest === null || isCreatedAfter(notification.createdAt, latest)) {
      latest = notification.createdAt
    }
  }
  return latest
}

async function filterUnshown(
  items: readonly NotificationDto[],
  seen: SeenStore,
): Promise<NotificationDto[]> {
  const unshown: NotificationDto[] = []
  for (const notification of items) {
    if (!(await seen.hasShown(notification.id))) unshown.push(notification)
  }
  return unshown
}

export async function syncMissedNotifications(deps: MissedNotificationsDeps): Promise<number> {
  const page = await deps.listUnread()
  const lastSeen = await deps.seen.getLastSeenCreatedAt()
  const fresh = page.items.filter(
    (notification) => lastSeen === null || isCreatedAfter(notification.createdAt, lastSeen),
  )
  const unshown = await filterUnshown(fresh, deps.seen)
  const oldestFirst = [...unshown].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  )

  if (oldestFirst.length > MAX_SEPARATE_NOTIFICATIONS) {
    const isWholePageFresh = fresh.length === page.items.length
    const beyondPage = isWholePageFresh ? Math.max(page.total - page.items.length, 0) : 0
    await deps.seen.markShown(oldestFirst.map(({ id, target }) => ({ id, target })))
    await deps.notifier.showSummary(oldestFirst.length + beyondPage)
  } else {
    for (const notification of oldestFirst) await deps.notifier.showNotification(notification)
  }

  const latest = newest(page.items)
  if (latest !== null) await deps.seen.advanceLastSeen(latest)
  return page.total
}
