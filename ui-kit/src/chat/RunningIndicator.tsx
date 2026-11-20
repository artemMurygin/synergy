import { useAuiState } from '@assistant-ui/react'
import { Loader, LoaderCircle } from '../icons'
import { RunNotice } from './RunNotice'

/** The agent is answering: a local run of the runtime or a run still going on the server. */
export function RunningIndicator({ serverRunning }: { serverRunning: boolean }) {
  const localRunning = useAuiState((s) => s.thread.isRunning)
  if (localRunning) {
    return (
      <p role="status" className="flex items-center gap-1.5 font-chat text-xs text-ink-40">
        <LoaderCircle size={14} className="animate-spin" />
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
