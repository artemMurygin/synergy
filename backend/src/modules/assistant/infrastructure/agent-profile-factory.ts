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
    readonly meetings: AgentCapability;
    readonly orchestratorModel: BaseChatModel;
    /** Stores the chat history of the top-level agent of every profile. */
    readonly checkpointer: BaseCheckpointSaver;
}

interface ThreadStateWriter {
    updateState(
        config: { configurable: Record<string, string> },
        values: { messages: AIMessage[] },
    ): Promise<unknown>;
}

function createContextWriter(
    model: BaseChatModel,
    checkpointer: BaseCheckpointSaver,
): ThreadStateWriter {
    return createDeepAgent({ model, checkpointer, subagents: [] }).graph;
}

export class AgentProfileFactory implements AgentContextWriterPort {
    private writer: ThreadStateWriter | undefined;

    constructor(private readonly options: AgentProfileFactoryOptions) {}

    // The writer has no specialists: only its state schema and checkpointer matter here.
    async appendAssistantMessage(threadId: string, text: string): Promise<void> {
        await this.contextWriter().updateState(
            { configurable: { thread_id: threadId } },
            { messages: [new AIMessage(text)] },
        );
    }

    private contextWriter(): ThreadStateWriter {
        this.writer ??= createContextWriter(
            this.options.orchestratorModel,
            this.options.checkpointer,
        );
        return this.writer;
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

    /** Orchestrator deep agent that delegates to the price, task and meeting specialists. */
    private buildApp(ctx: AgentRunContext): CapabilityAgent {
        const { sheetsQa, tasks, meetings, orchestratorModel, checkpointer } = this.options;
        const capabilities = [sheetsQa, tasks, meetings];
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
