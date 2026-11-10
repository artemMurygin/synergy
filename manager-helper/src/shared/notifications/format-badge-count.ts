const MAX_SHOWN_COUNT = 99

export function formatBadgeCount(count: number): string {
  if (count <= 0) return ''
  return count > MAX_SHOWN_COUNT ? `${String(MAX_SHOWN_COUNT)}+` : String(count)
}
