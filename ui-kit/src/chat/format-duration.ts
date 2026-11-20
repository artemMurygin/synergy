const SECONDS = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Duration of a tool call in seconds with one decimal: «0,4 с». Empty when it is unknown. */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return ''
  return `${SECONDS.format(ms / 1000)} с`
}
