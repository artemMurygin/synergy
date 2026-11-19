import { HttpAgent, type RunAgentInput } from '@ag-ui/client'
import { describe, expect, it, vi } from 'vitest'
import { liftFileIds, withFileIds } from './with-file-ids'

const input = (forwardedProps: unknown): RunAgentInput => ({
  threadId: 't',
  runId: 'r',
  messages: [],
  tools: [],
  context: [],
  state: {},
  forwardedProps,
})

describe('liftFileIds', () => {
  it('lifts runConfig.fileIds into forwardedProps.fileIds', () => {
    const out = liftFileIds(input({ runConfig: { fileIds: ['f1', 'f2'] }, other: 1 }))
    expect(out.forwardedProps).toMatchObject({ fileIds: ['f1', 'f2'], other: 1 })
  })

  it('leaves the input as is without files', () => {
    const same = input({ runConfig: { fileIds: [] } })
    expect(liftFileIds(same)).toBe(same)
    const none = input(undefined)
    expect(liftFileIds(none)).toBe(none)
  })
})

describe('withFileIds', () => {
  it('runs the agent with the lifted ids', () => {
    const agent = new HttpAgent({ url: 'http://localhost/agent' })
    const run = vi.spyOn(agent, 'run').mockImplementation(() => {
      throw new Error('stop')
    })
    const wrapped = withFileIds(agent)
    expect(wrapped).toBe(agent)
    expect(() => wrapped.run(input({ runConfig: { fileIds: ['f1'] } }))).toThrow('stop')
    expect(run.mock.calls[0]?.[0].forwardedProps).toMatchObject({ fileIds: ['f1'] })
  })
})
