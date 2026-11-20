const DAY_MS = 86_400_000
const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** Подпись группы списка уведомлений по дате: «Сегодня», «Вчера», «Ранее». */
export function groupByDay(iso: string, now: Date = new Date()): 'Сегодня' | 'Вчера' | 'Ранее' {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS)
  if (days <= 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  return 'Ранее'
}
