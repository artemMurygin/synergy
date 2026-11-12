import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { createDeepAgent, type CompiledSubAgent } from 'deepagents';
import type {
    AgentCapability,
    AgentRunContext,
    CapabilityAgent,
} from '../../../shared/agent-capability';
import type { ClientProfileRegistry } from '../application/client-profile-registry';
import type { ClientId } from '../domain/client-id';
import type { AgentContextWriterPort } from '../domain/ports/agent-context-writer.port';
import { buildOrchestratorPrompt } from './orchestrator-prompt';

export interface AgentProfileFactoryOptions {
    readonly registry: ClientProfileRegistry;
    readonly sheetsQa: AgentCapability;
    readonly tasks: AgentCapability;
    readonly orchestratorModel: BaseChatModel;
    /** Stores the chat history of the top-level agent of every profile. */
    readonly checkpointer: BaseCheckpointSaver;
}

/** The part of the compiled graph used to write into a thread without running the agent. */
interface StateWriter {
    updateState(
        config: { configurable: Record<string, string> },
        values: { messages: AIMessage[] },
    ): Promise<unknown>;
}

/** Assembles the agent of a client's profile for one run; capabilities see the run context. */
export class AgentProfileFactory implements AgentContextWriterPort {
    constructor(private readonly options: AgentProfileFactoryOptions) {}

    /**
     * Adds a message of the agent to the thread of an app chat, as if the orchestrator had written
     * it. The graph is built without specialists: only its state schema and checkpointer are used.
     */
    async appendAssistantMessage(threadId: string, text: string): Promise<void> {
        const { orchestratorModel, checkpointer } = this.options;
        const agent = createDeepAgent({ model: orchestratorModel, checkpointer, subagents: [] });
        const graph = agent.graph as unknown as StateWriter;
        await graph.updateState(
            { configurable: { thread_id: threadId } },
            { messages: [new AIMessage(text)] },
        );
    }

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
