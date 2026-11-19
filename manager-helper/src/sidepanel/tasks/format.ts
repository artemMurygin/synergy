const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })

/** "5 ноя" */
export function formatDay(iso: string): string {
  return DATE.format(new Date(iso)).replace('.', '')
}
