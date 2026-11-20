import type { ThreadMessageLike } from '@assistant-ui/react'

/** What the history needs for durations: a message that may carry stored tool calls with `durationMs`. */
type HistoryMessageLike = { role: string; toolCalls?: readonly { id: string }[] }

/** `durationMs` of the stored tool calls by call id: the AG-UI conversion drops the field. */
export function toolDurations(history: readonly HistoryMessageLike[]): Map<string, number> {
  const durations = new Map<string, number>()
  for (const message of history) {
    if (message.role !== 'assistant') continue
    for (const call of message.toolCalls ?? []) {
      if ('durationMs' in call && typeof call.durationMs === 'number') durations.set(call.id, call.durationMs)
    }
  }
  return durations
}

/** Puts the stored call durations into the `artifact` of the converted `tool-call` parts. */
export function withToolDurations<T extends ThreadMessageLike>(history: readonly HistoryMessageLike[], converted: readonly T[]): T[] {
  const durations = toolDurations(history)
  if (durations.size === 0) return [...converted]
  return converted.map((message) => {
    if (typeof message.content === 'string') return message
    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type !== 'tool-call') return part
        const durationMs = part.toolCallId === undefined ? undefined : durations.get(part.toolCallId)
        return durationMs === undefined ? part : { ...part, artifact: { durationMs } }
      }),
    }
  })
}
