export type ToolCallStatus = 'running' | 'complete' | 'error'

export type ToolCallView = {
  id: string
  name: string
  args: unknown
  result?: unknown
  status: ToolCallStatus
  /** How long the call took: saved by the server in a history or measured by the client during a run. */
  durationMs?: number
  /** Text of the error of a failed call, shown instead of the arguments. */
  error?: string
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
  /** Text of the status next to the icon: «Выполняется · K из N», «N готово», «1 ошибка». */
  status: string
  /** The same for the narrow layout: «K из N» while running, otherwise as `status`. */
  compactStatus: string
}

export function pluralizeErrors(count: number): string {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 14) return `${String(count)} ошибок`
  if (mod10 === 1) return `${String(count)} ошибка`
  if (mod10 >= 2 && mod10 <= 4) return `${String(count)} ошибки`
  return `${String(count)} ошибок`
}

/** Overall state of a group: «K из N» until every call finished, then the number of errors or "N готово". */
export function groupSummary(calls: readonly ToolCallView[]): GroupSummary {
  const total = calls.length
  const title = `${pluralizeCalls(total)} инструментов`
  const running = calls.filter((call) => call.status === 'running').length
  if (running > 0) {
    const progress = `${String(total - running)} из ${String(total)}`
    return { state: 'running', title: 'Вызываю инструменты…', status: `Выполняется · ${progress}`, compactStatus: progress }
  }
  const errors = calls.filter((call) => call.status === 'error').length
  if (errors > 0) {
    const status = pluralizeErrors(errors)
    return { state: 'error', title, status, compactStatus: status }
  }
  const status = `${String(total)} готово`
  return { state: 'done', title, status, compactStatus: status }
}

/** The duration the server saved with a call (`artifact.durationMs` of the tool-call part). */
export function toolDurationMs(artifact: unknown): number | undefined {
  if (typeof artifact !== 'object' || artifact === null || !('durationMs' in artifact)) return undefined
  const value = artifact.durationMs
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** Text of a failed result for the row of the call: one line. */
export function errorText(result: unknown): string {
  if (typeof result === 'string' && result.trim() !== '') return result.replace(/\s+/g, ' ').trim()
  if (typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string') {
    return result.message
  }
  return 'Ошибка вызова'
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
