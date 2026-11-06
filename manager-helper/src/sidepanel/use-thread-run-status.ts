import { useCallback, useEffect, useRef, useState } from 'react'
import { getThread } from '@/shared/threads-api'
import type { ThreadHistory } from '@/shared/threads-api'

export const RUN_POLL_INTERVAL_MS = 3000

interface Options {
  threadId: string | null
  /** The run flag of the thread as last read from the server (list or history). */
  running: boolean
  /** Called once with the fresh history when the run is over. */
  onFinished: (history: ThreadHistory) => void
}

interface RunState {
  threadId: string | null
  initial: boolean
  running: boolean
}

/**
 * `running` of the open chat. While it is true, re-reads the thread every few
 * seconds and reports once when the server no longer has an active run.
 */
export function useThreadRunStatus({ threadId, running: initial, onFinished }: Options) {
  const [state, setState] = useState<RunState>({ threadId, initial, running: initial })
  let current = state
  if (state.threadId !== threadId || state.initial !== initial) {
    current = { threadId, initial, running: initial }
    setState(current)
  }
  const running = current.running

  const onFinishedRef = useRef(onFinished)
  useEffect(() => {
    onFinishedRef.current = onFinished
  })

  useEffect(() => {
    if (threadId === null || !running) return
    let active = true
    let inFlight = false
    const timer = setInterval(() => {
      if (inFlight) return
      inFlight = true
      getThread(threadId)
        .then((history) => {
          if (!active || history.running) return
          active = false
          clearInterval(timer)
          setState((s) =>
            s.threadId === threadId && s.initial === initial ? { ...s, running: false } : s,
          )
          onFinishedRef.current(history)
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false
        })
    }, RUN_POLL_INTERVAL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [threadId, running, initial])

  /** The run was stopped by the user: hide the indicator without waiting for the poll. */
  const markStopped = useCallback(() => {
    setState((s) => ({ ...s, running: false }))
  }, [])

  return { running, markStopped }
}
