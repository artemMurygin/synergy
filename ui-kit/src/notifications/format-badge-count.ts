/** Текст бейджа непрочитанных: 0 скрывает бейдж (пустая строка), больше 99 — «99+». */
export function formatBadgeCount(count: number): string {
  if (count <= 0) return ''
  return count > 99 ? '99+' : String(count)
}
