import type { Runnable } from '@langchain/core/runnables';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { ReactAgent } from 'langchain';
import type { AgentRunContext } from './agent-run-context';

/** How a capability sees the conversation: with its own clean context or with a fork of the caller's. */
export const AGENT_CAPABILITY_MODES = ['isolated', 'fork'] as const;

export type AgentCapabilityMode = (typeof AGENT_CAPABILITY_MODES)[number];

export interface BuildAgentOptions {
    readonly checkpointer?: BaseCheckpointSaver | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CapabilityAgent = ReactAgent<any> | Runnable;

/** Contract of an agent capability: implemented by domain modules, consumed by the assistant module. */
export interface AgentCapability {
    readonly name: string;
    readonly description: string;
    readonly mode: AgentCapabilityMode;
    buildAgent(ctx: AgentRunContext, options?: BuildAgentOptions): CapabilityAgent;
}
