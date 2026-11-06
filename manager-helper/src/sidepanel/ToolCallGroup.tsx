import { useId, useState } from 'react'

export interface ToolCallView {
  id: string
  name: string
  args: unknown
  status: 'running' | 'complete'
}

interface Props {
  toolCalls: ToolCallView[]
  /** Run state of the message the calls belong to. */
  status: 'running' | 'complete' | 'aborted'
  durationMs?: number
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join(', ')
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function formatArgs(args: unknown): string {
  if (args === null || args === undefined) return ''
  if (typeof args === 'object' && !Array.isArray(args)) {
    return Object.entries(args)
      .map(([key, value]) => `${key}: ${formatValue(value)}`)
      .join(', ')
  }
  return formatValue(args)
}

function pluralizeCalls(count: number): string {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 14) return `${String(count)} вызовов`
  if (mod10 === 1) return `${String(count)} вызов`
  if (mod10 >= 2 && mod10 <= 4) return `${String(count)} вызова`
  return `${String(count)} вызовов`
}

function summary(toolCalls: ToolCallView[], status: Props['status'], durationMs?: number): string {
  if (status === 'running') {
    const done = toolCalls.filter((call) => call.status === 'complete').length
    return `идёт · ${String(done)} из ${String(toolCalls.length)}`
  }
  const count = pluralizeCalls(toolCalls.length)
  if (status === 'aborted') return `${count} · прервано`
  if (durationMs === undefined) return count
  return `${count} · ${(durationMs / 1000).toFixed(1).replace('.', ',')} с`
}

function StatusIcon({ status }: { status: ToolCallView['status'] }) {
  const running = status === 'running'
  return (
    <svg
      role="img"
      aria-label={running ? 'выполняется' : 'завершён'}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={running ? 'shrink-0 animate-spin text-brand-red' : 'shrink-0 text-[#1e9e62]'}
    >
      {running ? <path d="M21 12a9 9 0 1 1-6.219-8.56" /> : <path d="M20 6 9 17l-5-5" />}
    </svg>
  )
}

export function ToolCallGroup({ toolCalls, status, durationMs }: Props) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()

  if (toolCalls.length === 0) return null

  return (
    <div className="rounded-xl border border-line bg-white">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs"
        onClick={() => {
          setOpen((value) => !value)
        }}
      >
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-ink-60"
        >
          <path d={open ? 'm6 9 6 6 6-6' : 'm9 18 6-6-6-6'} />
        </svg>
        <span className="font-semibold text-ink">Ход работы</span>
        <span className="min-w-0 flex-1 truncate text-ink-60">
          {summary(toolCalls, status, durationMs)}
        </span>
      </button>
      {open && (
        <ul id={bodyId} className="flex flex-col gap-2 px-3 pb-3">
          {toolCalls.map((call) => (
            <li key={call.id} className="flex items-center gap-2 text-xs">
              <StatusIcon status={call.status} />
              <span className="shrink-0 font-semibold text-ink">{call.name}</span>
              <span className="min-w-0 flex-1 truncate text-ink-60">{formatArgs(call.args)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
