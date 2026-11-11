import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { createDeepAgent, type CompiledSubAgent } from 'deepagents';
import type {
    AgentCapability,
    AgentRunContext,
    CapabilityAgent,
} from '../../../shared/agent-capability';
import type { ClientProfileRegistry } from '../application/client-profile-registry';
import type { ClientId } from '../domain/client-id';
import { buildOrchestratorPrompt } from './orchestrator-prompt';

export interface AgentProfileFactoryOptions {
    readonly registry: ClientProfileRegistry;
    readonly sheetsQa: AgentCapability;
    readonly tasks: AgentCapability;
    readonly orchestratorModel: BaseChatModel;
    /** Stores the chat history of the top-level agent of every profile. */
    readonly checkpointer: BaseCheckpointSaver;
}

/** Assembles the agent of a client's profile for one run; capabilities see the run context. */
export class AgentProfileFactory {
    constructor(private readonly options: AgentProfileFactoryOptions) {}

    build(client: ClientId, ctx: AgentRunContext): CapabilityAgent {
        // The registry rejects an unknown client before any capability is built.
        switch (this.options.registry.profileOf(client)) {
            case 'app':
                return this.buildApp(ctx);
            case 'telegram':
                return this.buildTelegram(ctx);
        }
    }

    /** Orchestrator deep agent that delegates to the price and task specialists. */
    private buildApp(ctx: AgentRunContext): CapabilityAgent {
        const { sheetsQa, tasks, orchestratorModel, checkpointer } = this.options;
        const capabilities = [sheetsQa, tasks];
        const subagents = capabilities.map((capability): CompiledSubAgent => ({
            name: capability.name,
            description: capability.description,
            runnable: capability.buildAgent(ctx),
            mode: capability.mode,
        }));
        return createDeepAgent({
            model: orchestratorModel,
            checkpointer,
            systemPrompt: buildOrchestratorPrompt(capabilities),
            subagents,
        });
    }

    /** The tasks agent alone, with its own dialog history: no subagents, no price tools. */
    private buildTelegram(ctx: AgentRunContext): CapabilityAgent {
        const { tasks, checkpointer } = this.options;
        return tasks.buildAgent(ctx, { checkpointer });
    }
}
