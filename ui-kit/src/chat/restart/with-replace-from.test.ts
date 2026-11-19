import { HttpAgent, type RunAgentInput } from '@ag-ui/client'
import { describe, expect, it, vi } from 'vitest'
import { withReplaceFrom } from './with-replace-from'

const input = (forwardedProps: unknown): RunAgentInput => ({
  threadId: 't',
  runId: 'r',
  messages: [],
  tools: [],
  context: [],
  state: {},
  forwardedProps,
})

function setup(pending: { id: string | null }) {
  const agent = new HttpAgent({ url: 'http://localhost/agent' })
  const run = vi.spyOn(agent, 'run').mockImplementation(() => {
    throw new Error('stop')
  })
  const takePending = vi.fn(() => {
    const id = pending.id
    pending.id = null
    return id
  })
  const wrapped = withReplaceFrom(agent, takePending)
  const call = (props: unknown) => {
    try {
      wrapped.run(input(props))
    } catch {
      /* mocked */
    }
  }
  return { wrapped, agent, run, call, takePending }
}

describe('withReplaceFrom', () => {
  it('returns the same agent', () => {
    const { wrapped, agent } = setup({ id: null })
    expect(wrapped).toBe(agent)
  })

  it('adds replaceFromMessageId only to the nearest run after the point is set', () => {
    const pending = { id: '42' }
    const { run, call } = setup(pending)
    call({ fileIds: ['f'] })
    call({ fileIds: ['f'] })
    expect(run.mock.calls[0]?.[0].forwardedProps).toMatchObject({ fileIds: ['f'], replaceFromMessageId: '42' })
    expect(run.mock.calls[1]?.[0].forwardedProps).not.toHaveProperty('replaceFromMessageId')
  })

  it('takes a point set later by the next run', () => {
    const pending: { id: string | null } = { id: null }
    const { run, call } = setup(pending)
    call(undefined)
    pending.id = '7'
    call(undefined)
    expect(run.mock.calls[0]?.[0].forwardedProps).toBeUndefined()
    expect(run.mock.calls[1]?.[0].forwardedProps).toMatchObject({ replaceFromMessageId: '7' })
  })
})
