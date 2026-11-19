export type ToolCallStatus = 'running' | 'complete' | 'error'

export type ToolCallView = {
  id: string
  name: string
  args: unknown
  result?: unknown
  status: ToolCallStatus
}

/** A call runs while its message runs and no result came; a failed tool is an error. */
export function callStatus(input: {
  messageRunning: boolean
  result: unknown
  isError: boolean
}): ToolCallStatus {
  if (input.isError) return 'error'
  if (input.messageRunning && input.result === undefined) return 'running'
  return 'complete'
}

export function statusLabel(status: ToolCallStatus): string {
  if (status === 'running') return 'выполняется'
  if (status === 'error') return 'ошибка'
  return 'завершён'
}

export function pluralizeCalls(count: number): string {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 14) return `${String(count)} вызовов`
  if (mod10 === 1) return `${String(count)} вызов`
  if (mod10 >= 2 && mod10 <= 4) return `${String(count)} вызова`
  return `${String(count)} вызовов`
}

export type GroupSummary = {
  state: 'running' | 'error' | 'done'
  title: string
  status: string
}

/** Overall state of a group: running until every call finished, then error or "N готово". */
export function groupSummary(calls: readonly ToolCallView[]): GroupSummary {
  const title = `${pluralizeCalls(calls.length)} инструментов`
  if (calls.some((call) => call.status === 'running')) return { state: 'running', title, status: 'выполняется' }
  if (calls.some((call) => call.status === 'error')) return { state: 'error', title, status: 'ошибка' }
  return { state: 'done', title, status: `${String(calls.length)} готово` }
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join(', ')
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** One-line summary of the arguments: `key: value, key: value`. */
export function formatArgs(args: unknown): string {
  if (args === null || args === undefined) return ''
  if (typeof args === 'object' && !Array.isArray(args)) {
    return Object.entries(args)
      .map(([key, value]) => `${key}: ${formatValue(value)}`)
      .join(', ')
  }
  return formatValue(args)
}

/** Text of the details block: strings as they are, other values pretty printed. */
export function formatDetails(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}
