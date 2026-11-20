import { useAuiState, type ToolCallMessagePartProps } from '@assistant-ui/react'
import { createContext, useContext, useEffect, useId, useRef, useState, type PropsWithChildren } from 'react'
import { ChevronDown, ChevronRight, CircleCheck, CircleX, LoaderCircle } from '../icons'
import { useOptionalLayoutMode } from '../layout/layout-mode'
import { cn } from '../lib/cn'
import { formatDuration } from './format-duration'
import {
  callStatus,
  errorText,
  formatArgs,
  formatDetails,
  groupSummary,
  statusLabel,
  toolDurationMs,
  type ToolCallStatus,
  type ToolCallView,
} from './tool-status'

function StatusIcon({ status, decorative = false }: { status: ToolCallStatus; decorative?: boolean }) {
  const a11y = decorative ? {} : { role: 'img', 'aria-label': statusLabel(status), 'aria-hidden': false }
  if (status === 'running') return <LoaderCircle {...a11y} size={14} className="shrink-0 animate-spin text-ink-60" />
  if (status === 'error') return <CircleX {...a11y} size={14} className="shrink-0 text-brand-red" />
  return <CircleCheck {...a11y} size={14} className="shrink-0 text-success" />
}

function Details({ args, result, running }: { args: unknown; result: unknown; running: boolean }) {
  const block = (caption: string, text: string) => (
    <div className="flex flex-col gap-1">
      <span className="font-chat text-[11px] font-medium text-ink-60">{caption}</span>
      <pre className="overflow-x-auto rounded-lg bg-surface-alt px-2.5 py-2 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap text-ink-80">
        {text}
      </pre>
    </div>
  )
  return (
    <div className="flex flex-col gap-2 pt-0.5 pr-3 pb-2.5 pl-8.5">
      {block('Аргументы', formatDetails(args) || '{}')}
      {!running && result !== undefined && block('Результат', formatDetails(result))}
    </div>
  )
}

/** One call of the group (Tool Call Row): status, tool name, arguments in short; opens into details. */
export function ToolCallRow({ call }: { call: ToolCallView }) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const duration = formatDuration(call.durationMs)
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => {
          setOpen(!open)
        }}
        className="flex w-full items-center gap-2 px-3 py-[7px] text-left outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-brand-red/40 focus-visible:ring-inset"
      >
        <StatusIcon status={call.status} />
        <span className="shrink-0 font-mono text-xs font-medium text-ink">{call.name}</span>
        {call.status === 'error' ? (
          <span className="min-w-0 flex-1 truncate font-chat text-xs text-brand-red">{call.error ?? errorText(call.result)}</span>
        ) : (
          <span className="min-w-0 flex-1 truncate font-chat text-xs text-ink-60">{formatArgs(call.args)}</span>
        )}
        {duration !== '' && <span className="shrink-0 font-chat text-xs text-ink-40">{duration}</span>}
        {open ? <ChevronDown size={14} className="shrink-0 text-ink-40" /> : <ChevronRight size={14} className="shrink-0 text-ink-40" />}
      </button>
      {open && (
        <div id={detailsId}>
          <Details args={call.args} result={call.result} running={call.status === 'running'} />
        </div>
      )}
    </div>
  )
}

type ToolGroupProps = PropsWithChildren<{ calls: readonly ToolCallView[] }>

/**
 * Group of tool calls of one message (Tool Group): open while a call runs, folds when the run ends
 * unless the user opened it themselves; saved messages are collapsed.
 */
export function ToolGroup({ calls, children }: ToolGroupProps) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const compact = useOptionalLayoutMode() === 'mobile'
  const bodyId = useId()
  if (calls.length === 0) return null
  const summary = groupSummary(calls)
  const open = userOpen ?? summary.state === 'running'
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          setUserOpen(!open)
        }}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 focus-visible:ring-inset"
      >
        {open ? <ChevronDown size={14} className="shrink-0 text-ink-60" /> : <ChevronRight size={14} className="shrink-0 text-ink-60" />}
        <span className="min-w-0 flex-1 truncate font-chat text-[13px] font-medium text-ink">{summary.title}</span>
        <StatusIcon decorative status={summary.state === 'running' ? 'running' : summary.state === 'error' ? 'error' : 'complete'} />
        <span className={cn('font-chat text-xs', summary.state === 'error' ? 'text-brand-red' : 'text-ink-60')}>
          {compact ? summary.compactStatus : summary.status}
        </span>
      </button>
      {open && (
        <div id={bodyId} className="flex flex-col py-1">
          {children ?? calls.map((call) => <ToolCallRow key={call.id} call={call} />)}
        </div>
      )}
    </div>
  )
}

/**
 * Duration of the calls: the server's one when the part carries it, otherwise measured from the moment
 * the call is first seen running until its result arrives (TOOL_CALL_START -> TOOL_CALL_RESULT).
 */
const MeasuredDurations = createContext<Record<string, number>>({})

function useMeasuredDurations(calls: readonly ToolCallView[]): Record<string, number> {
  const starts = useRef(new Map<string, number>())
  const [measured, setMeasured] = useState<Record<string, number>>({})
  useEffect(() => {
    const now = Date.now()
    const done: Record<string, number> = {}
    for (const call of calls) {
      if (call.status === 'running') {
        if (!starts.current.has(call.id)) starts.current.set(call.id, now)
        continue
      }
      const start = starts.current.get(call.id)
      if (start !== undefined) {
        done[call.id] = now - start
        starts.current.delete(call.id)
      }
    }
    // setState осознанный: длительность измеряется по смене статуса вызова
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Object.keys(done).length > 0) setMeasured((prev) => ({ ...prev, ...done }))
  }, [calls])
  return measured
}

/** `components.ToolGroup` of `MessagePrimitive.Parts`: calls of the group read from the message parts. */
export function ToolGroupParts({ startIndex, endIndex, children }: PropsWithChildren<{ startIndex: number; endIndex: number }>) {
  const content = useAuiState((s) => s.message.content)
  const messageRunning = useAuiState((s) => s.message.status?.type === 'running')
  const base = content.slice(startIndex, endIndex + 1).flatMap((part): ToolCallView[] => {
    if (part.type !== 'tool-call') return []
    const status = callStatus({ messageRunning, result: part.result, isError: part.isError === true })
    return [
      {
        id: part.toolCallId,
        name: part.toolName,
        args: part.args,
        result: part.result,
        status,
        durationMs: toolDurationMs(part.artifact),
        error: status === 'error' ? errorText(part.result) : undefined,
      },
    ]
  })
  const measured = useMeasuredDurations(base)
  const calls = base.map((call) => ({ ...call, durationMs: call.durationMs ?? measured[call.id] }))
  return (
    <MeasuredDurations.Provider value={measured}>
      <ToolGroup calls={calls}>{children}</ToolGroup>
    </MeasuredDurations.Provider>
  )
}

/** `tools.Fallback` of `MessagePrimitive.Parts`: the row of one call inside the group. */
export function ToolFallback({ toolCallId, toolName, args, result, isError, artifact, status }: ToolCallMessagePartProps) {
  const measured = useContext(MeasuredDurations)
  const callState = callStatus({ messageRunning: status.type === 'running', result, isError: isError === true })
  return (
    <ToolCallRow
      call={{
        id: toolCallId,
        name: toolName,
        args,
        result,
        status: callState,
        durationMs: toolDurationMs(artifact) ?? measured[toolCallId],
        error: callState === 'error' ? errorText(result) : undefined,
      }}
    />
  )
}
