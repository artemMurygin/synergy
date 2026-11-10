const KB = 1024
const MB = KB * 1024

const oneDecimal = (value: number): string => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)

/** Human-readable file size: "320 КБ", "1,4 МБ". */
export function formatSize(bytes: number): string {
  if (bytes >= MB) return `${oneDecimal(bytes / MB)} МБ`
  if (bytes >= KB) return `${oneDecimal(bytes / KB)} КБ`
  return `${String(bytes)} Б`
}
