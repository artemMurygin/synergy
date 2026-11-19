import type { HttpAgent, RunAgentInput } from '@ag-ui/client'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The composer puts the attached file ids into the message run config (`runConfig.custom.fileIds`),
 * which the AG-UI runtime forwards as `forwardedProps.runConfig`. The backend reads `forwardedProps.fileIds`.
 */
export function liftFileIds(input: RunAgentInput): RunAgentInput {
  const props: Record<string, unknown> = isRecord(input.forwardedProps) ? input.forwardedProps : {}
  const runConfig = isRecord(props.runConfig) ? props.runConfig : undefined
  const fileIds = runConfig?.fileIds
  if (!Array.isArray(fileIds) || fileIds.length === 0) return input
  return { ...input, forwardedProps: { ...props, fileIds } }
}

/** Makes every run of the agent carry the attached file ids where the backend reads them. */
export function withFileIds(agent: HttpAgent): HttpAgent {
  const run = agent.run.bind(agent)
  agent.run = (input) => run(liftFileIds(input))
  return agent
}
