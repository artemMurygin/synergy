import { EventType, HttpAgent } from '@ag-ui/client'
import type { BaseEvent } from '@ag-ui/client'
import { Observable } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { connectRestartRuns } from './connect-restart-runs'

function setup(pending: { id: string | null }) {
  const agent = new HttpAgent({ url: 'http://localhost/agent' })
  const events: BaseEvent[] = [
    { type: EventType.CUSTOM, name: 'user-message-saved', value: { messageId: '9' } },
    { type: EventType.RUN_STARTED },
  ]
  const run = vi.spyOn(agent, 'run').mockImplementation(
    () =>
      new Observable<BaseEvent>((subscriber) => {
        for (const event of events) subscriber.next(event)
        subscriber.complete()
      }),
  )
  const onSaved = vi.fn()
  const onRestarted = vi.fn()
  connectRestartRuns(agent, {
    takePending: () => {
      const id = pending.id
      pending.id = null
      return id
    },
    onSaved,
    onRestarted,
  })
  const input = (id: string) => ({
    threadId: 't', runId: 'r', tools: [], context: [], state: {}, forwardedProps: undefined,
    messages: [{ id, role: 'user' as const, content: 'q' }],
  })
  const seen: BaseEvent[] = []
  const go = (id: string) => {
    seen.length = 0
    agent.run(input(id)).subscribe((event) => {
      seen.push(event)
    })
  }
  return { run, onSaved, onRestarted, seen, go }
}

describe('connectRestartRuns', () => {
  it('reports the saved question with the local id and hides the event from the runtime', () => {
    const { go, onSaved, seen } = setup({ id: null })
    go('local-1')
    expect(onSaved).toHaveBeenCalledWith({ name: 'user-message-saved', value: { messageId: '9' } }, 'local-1')
    expect(seen.map((e) => e.type)).toEqual([EventType.RUN_STARTED])
  })

  it('carries the restart point once and tells the host a restart began', () => {
    const { go, run, onRestarted } = setup({ id: '42' })
    go('a')
    go('b')
    expect(run.mock.calls[0]?.[0].forwardedProps).toMatchObject({ replaceFromMessageId: '42' })
    expect(run.mock.calls[1]?.[0].forwardedProps).toBeUndefined()
    expect(onRestarted).toHaveBeenCalledTimes(1)
  })
})
