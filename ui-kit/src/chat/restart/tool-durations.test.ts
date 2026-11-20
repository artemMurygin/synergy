import type { ThreadMessageLike } from '@assistant-ui/react'
import { describe, expect, it } from 'vitest'
import { withToolDurations } from './tool-durations'

const call = { id: 'c1', type: 'function', function: { name: 'f', arguments: '{}' }, durationMs: 400 }

describe('withToolDurations', () => {
  it('moves the stored durationMs into the artifact of the matching tool-call part', () => {
    const converted: ThreadMessageLike[] = [
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'f', args: {} }, { type: 'tool-call', toolCallId: 'c2', toolName: 'g', args: {} }] },
      { role: 'user', content: 'text' },
    ]
    const out = withToolDurations([{ role: 'assistant', toolCalls: [call] }], converted)
    const content = out[0]?.content
    const parts = typeof content === 'string' || content === undefined ? [] : content
    expect(parts[0]).toMatchObject({ artifact: { durationMs: 400 } })
    expect(parts[1]).not.toHaveProperty('artifact')
    expect(out[1]).toBe(converted[1])
  })

  it('returns the messages unchanged when no call has a duration', () => {
    const converted: ThreadMessageLike[] = [{ role: 'user', content: 'x' }]
    expect(withToolDurations([{ role: 'assistant', toolCalls: [{ id: 'c' }] }], converted)).toEqual(converted)
  })
})
