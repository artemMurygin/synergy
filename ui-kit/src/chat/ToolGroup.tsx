import { useAuiState, type ToolCallMessagePartProps } from '@assistant-ui/react'
import { useId, useState, type PropsWithChildren } from 'react'
import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, Loader } from '../icons'
import { cn } from '../lib/cn'
import {
  callStatus,
  formatArgs,
  formatDetails,
  groupSummary,
  statusLabel,
  type ToolCallStatus,
  type ToolCallView,
} from './tool-status'

function StatusIcon({ status, decorative = false }: { status: ToolCallStatus; decorative?: boolean }) {
  const size = 14
  if (decorative) {
    if (status === 'running') return <Loader size={size} className="shrink-0 animate-spin text-brand-red" />
    if (status === 'error') return <CircleAlert size={size} className="shrink-0 text-brand-red" />
    return <CircleCheck size={size} className="shrink-0 text-success" />
  }
  const label = statusLabel(status)
  if (status === 'running') {
    return <Loader role="img" aria-label={label} aria-hidden={false} size={size} className="shrink-0 animate-spin text-brand-red" />
  }
  if (status === 'error') {
    return <CircleAlert role="img" aria-label={label} aria-hidden={false} size={size} className="shrink-0 text-brand-red" />
  }
  return <CircleCheck role="img" aria-label={label} aria-hidden={false} size={size} className="shrink-0 text-success" />
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
        <span className="min-w-0 flex-1 truncate font-chat text-xs text-ink-60">{formatArgs(call.args)}</span>
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

/** Group of tool calls of one message (Tool Group): collapsed by default, rows on expand. */
export function ToolGroup({ calls, children }: ToolGroupProps) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  if (calls.length === 0) return null
  const summary = groupSummary(calls)
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          setOpen(!open)
        }}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 focus-visible:ring-inset"
      >
        {open ? <ChevronDown size={14} className="shrink-0 text-ink-60" /> : <ChevronRight size={14} className="shrink-0 text-ink-60" />}
        <span className="min-w-0 flex-1 truncate font-chat text-[13px] font-medium text-ink">{summary.title}</span>
        <StatusIcon decorative status={summary.state === 'running' ? 'running' : summary.state === 'error' ? 'error' : 'complete'} />
        <span className={cn('font-chat text-xs', summary.state === 'error' ? 'text-brand-red' : 'text-ink-60')}>
          {summary.status}
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

/** `components.ToolGroup` of `MessagePrimitive.Parts`: calls of the group read from the message parts. */
export function ToolGroupParts({ startIndex, endIndex, children }: PropsWithChildren<{ startIndex: number; endIndex: number }>) {
  const content = useAuiState((s) => s.message.content)
  const messageRunning = useAuiState((s) => s.message.status?.type === 'running')
  const calls = content.slice(startIndex, endIndex + 1).flatMap((part): ToolCallView[] =>
    part.type === 'tool-call'
      ? [
          {
            id: part.toolCallId,
            name: part.toolName,
            args: part.args,
            result: part.result,
            status: callStatus({ messageRunning, result: part.result, isError: part.isError === true }),
          },
        ]
      : [],
  )
  return <ToolGroup calls={calls}>{children}</ToolGroup>
}

/** `tools.Fallback` of `MessagePrimitive.Parts`: the row of one call inside the group. */
export function ToolFallback({ toolCallId, toolName, args, result, isError, status }: ToolCallMessagePartProps) {
  return (
    <ToolCallRow
      call={{
        id: toolCallId,
        name: toolName,
        args,
        result,
        status: callStatus({ messageRunning: status.type === 'running', result, isError: isError === true }),
      }}
    />
  )
}
