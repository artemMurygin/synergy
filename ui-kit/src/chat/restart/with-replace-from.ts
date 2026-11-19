import type { HttpAgent, RunAgentInput } from '@ag-ui/client'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Makes the nearest run carry `forwardedProps.replaceFromMessageId`: the server drops the chat from that
 * message and answers again. `takePending` returns the restart point once and clears it.
 */
export function withReplaceFrom(agent: HttpAgent, takePending: () => string | null | undefined): HttpAgent {
  const run = agent.run.bind(agent)
  agent.run = (input: RunAgentInput) => {
    const id = takePending()
    if (id === null || id === undefined || id === '') return run(input)
    const props: Record<string, unknown> = isRecord(input.forwardedProps) ? input.forwardedProps : {}
    return run({ ...input, forwardedProps: { ...props, replaceFromMessageId: id } })
  }
  return agent
}
