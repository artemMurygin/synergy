import { GraphRecursionError } from '@langchain/langgraph';
import type { PinoLogger } from 'nestjs-pino';
import {
    AgentRunContext,
    RunAttachments,
    type AttachmentRef,
    type CapabilityAgent,
} from '../../../shared/agent-capability';
import { AgentEvent, RUN_FAILED_PUBLIC_MESSAGE } from '../domain/agent-event';
import type { ClientId } from '../../../shared/client/client-id';
import { AgentRunnerPort, type AgentRunScope } from '../domain/ports/agent-runner.port';
import type { RunInput } from '../domain/run-input';
import { StreamEventMapper } from './map-stream-event';

/** The streaming surface shared by ReactAgent and any Runnable (their union has no single call signature). */
interface StreamingAgent {
    streamEvents(
        input: { messages: { role: string; content: string }[] },
        options: {
            version: 'v2';
            recursionLimit: number;
            signal: AbortSignal;
            configurable: Record<string, string>;
        },
    ): AsyncIterable<unknown>;
}

function isStreamingAgent(value: unknown): value is StreamingAgent {
    return (
        typeof value === 'object' &&
        value !== null &&
        'streamEvents' in value &&
        typeof value.streamEvents === 'function'
    );
}

function asStreamingAgent(agent: CapabilityAgent): StreamingAgent {
    const candidate: unknown = agent;
    if (!isStreamingAgent(candidate)) {
        throw new Error('The built agent does not support event streaming');
    }
    return candidate;
}

/** Builds the agent of a client for one run. */
export interface AgentFactory {
    build(client: ClientId, ctx: AgentRunContext): CapabilityAgent;
}

export interface AgentRunnerOptions {
    readonly agents: AgentFactory;
    readonly maxSteps: number;
    readonly timeoutMs: number;
    readonly logger: PinoLogger;
}

/** Runs the agent of the client's profile and maps its LangGraph event stream to AgentEvent. */
export class AgentRunner extends AgentRunnerPort {
    constructor(private readonly options: AgentRunnerOptions) {
        super();
        this.options.logger.setContext(AgentRunner.name);
    }

    async *stream(
        input: RunInput,
        signal: AbortSignal,
        scope: AgentRunScope,
    ): AsyncGenerator<AgentEvent> {
        const { options } = this;
        const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
        const mapper = new StreamEventMapper();

        yield AgentEvent.runStarted();

        // Files issued by tools are streamed right after the event that produced them; the list
        // reaches run-finished only on success, so a failed or cancelled run attaches nothing.
        const attachments = RunAttachments.create();
        const pending: AttachmentRef[] = [];
        const unsubscribe = attachments.subscribe((file) => pending.push(file));
        const drain = function* (): Generator<AgentEvent> {
            while (pending.length > 0) {
                const file = pending.shift();
                if (file !== undefined) yield AgentEvent.fileAttached(file);
            }
        };

        try {
            const ctx = AgentRunContext.create({
                userId: scope.userId,
                threadId: input.threadId,
                attachments,
            });
            // Built per run: capabilities capture the run context, so no state is shared between runs.
            const agent = asStreamingAgent(options.agents.build(scope.client, ctx));
            const events = agent.streamEvents(
                { messages: [{ role: 'user', content: input.agentText() }] },
                {
                    version: 'v2',
                    recursionLimit: options.maxSteps,
                    signal: AbortSignal.any([signal, timeoutSignal]),
                    configurable: {
                        thread_id: input.threadId,
                        userId: scope.userId,
                        // A fork: the new checkpoint continues from this one, the old branch is left behind.
                        ...(scope.fromCheckpointId === undefined
                            ? {}
                            : { checkpoint_id: scope.fromCheckpointId }),
                    },
                },
            );
            for await (const raw of events) {
                if (signal.aborted) break;
                yield* mapper.map(raw);
                yield* drain();
            }
        } catch (error) {
            unsubscribe();
            yield this.failureOf(error, signal, timeoutSignal, input);
            return;
        }
        unsubscribe();

        // A model that ignores the signal may end the stream normally after an abort.
        if (signal.aborted) {
            yield AgentEvent.runCancelled();
        } else if (timeoutSignal.aborted) {
            yield this.timeoutFailure();
        } else {
            yield* drain();
            yield mapper.finish(attachments.list());
        }
    }

    private failureOf(
        err: unknown,
        signal: AbortSignal,
        timeoutSignal: AbortSignal,
        input: RunInput,
    ): AgentEvent {
        if (signal.aborted) return AgentEvent.runCancelled();
        if (timeoutSignal.aborted) return this.timeoutFailure();
        if (err instanceof GraphRecursionError) {
            return AgentEvent.runFailed(
                `Агент превысил лимит шагов (${String(this.options.maxSteps)}). Попробуйте сузить вопрос.`,
            );
        }
        this.options.logger.error(
            { err, runId: input.runId, threadId: input.threadId },
            'Agent stream failed',
        );
        return AgentEvent.runFailed(RUN_FAILED_PUBLIC_MESSAGE);
    }

    private timeoutFailure(): AgentEvent {
        const seconds = Math.round(this.options.timeoutMs / 1000);
        return AgentEvent.runFailed(`Превышено время ожидания ответа (${String(seconds)} с)`);
    }
}
