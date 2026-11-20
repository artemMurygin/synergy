import { EventType } from '@ag-ui/client'
import type { BaseEvent, CustomEvent, HttpAgent } from '@ag-ui/client'
import { filter, tap } from 'rxjs'
import { USER_MESSAGE_SAVED_EVENT } from './use-server-message-ids'
import { withReplaceFrom } from './with-replace-from'

export type RestartRunsPorts = {
  /** The restart point of the next run (once), or `null`. Taking a point means the run restarts the chat. */
  takePending: () => string | null | undefined
  /** The server named the saved question: `localId` is the question of the feed that started the run. */
  onSaved: (event: { name: string; value?: unknown }, localId: string) => void
  /** A run that took a restart point reached the saved question (the server changed the history). */
  onRestarted?: () => void
}

function isSavedEvent(event: BaseEvent): event is CustomEvent {
  return event.type === EventType.CUSTOM && 'name' in event && event.name === USER_MESSAGE_SAVED_EVENT
}

function lastUserMessageId(messages: readonly { id: string; role: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.role === 'user') return message.id
  }
  return ''
}

/**
 * Wires a chat restart into the agent: the nearest run carries the point (`replaceFromMessageId`),
 * the `user-message-saved` event is handed to `onSaved` with the local id of the question and is
 * hidden from the runtime (it comes before `RUN_STARTED`).
 */
export function connectRestartRuns(agent: HttpAgent, ports: RestartRunsPorts): HttpAgent {
  withReplaceFrom(agent, () => {
    const id = ports.takePending()
    if (id !== null && id !== undefined && id !== '') ports.onRestarted?.()
    return id
  })
  const run = agent.run.bind(agent)
  agent.run = (input) => {
    const localId = lastUserMessageId(input.messages)
    return run(input).pipe(
      tap((event) => {
        if (isSavedEvent(event)) ports.onSaved({ name: event.name, value: event.value }, localId)
      }),
      filter((event) => !isSavedEvent(event)),
    )
  }
  return agent
}
