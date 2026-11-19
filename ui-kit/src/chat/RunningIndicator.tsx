import { useAuiState } from '@assistant-ui/react'
import { Loader } from '../icons'
import { RunNotice } from './RunNotice'

/** The agent is answering: a local run of the runtime or a run still going on the server. */
export function RunningIndicator({ serverRunning }: { serverRunning: boolean }) {
  const localRunning = useAuiState((s) => s.thread.isRunning)
  if (localRunning) {
    return (
      <p role="status" className="flex items-center gap-2 font-chat text-[13px] text-ink-60">
        <span className="size-2 animate-pulse rounded-full bg-brand-red" />
        Агент отвечает…
      </p>
    )
  }
  if (serverRunning) {
    return (
      <RunNotice
        tone="info"
        role="status"
        icon={<Loader size={18} className="animate-spin" />}
        title="Агент ещё отвечает"
        text="Ответ появится в чате, когда будет готов."
      />
    )
  }
  return null
}
