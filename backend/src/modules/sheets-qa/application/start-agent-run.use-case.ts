import { Injectable } from '@nestjs/common';
import { AgentEvent } from '../domain/agent-event';
import type { AgentRun } from '../domain/agent-run';
import type { ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import { ChatThreadPort } from '../domain/ports/chat-thread.port';
import { SheetsAssistantPort } from '../domain/ports/sheets-assistant.port';
import { RunConflictError } from '../domain/run-conflict.error';
import { InvalidRunInputError, RunInput, type RunInputProps } from '../domain/run-input';

export { MAX_QUESTION_LENGTH } from '../domain/run-input';

export class InvalidQuestionError extends Error {}

/**
 * Receiver of the events of one run (the SSE response in the interface layer).
 * It owns its connection: after the connection is gone it simply drops events.
 * Exceptions thrown by it never interrupt the run.
 */
export interface RunObserver {
    next(event: AgentEvent): void;
    /** Called once when the run is over, after the terminal event. */
    close(): void;
}

@Injectable()
export class StartAgentRunUseCase {
    constructor(
        private readonly assistant: SheetsAssistantPort,
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly threads: ChatThreadPort,
        private readonly registry: ActiveRunRegistryPort,
    ) {}

    /**
     * Validate the input, check the chat, register the run, store the question and start
     * the agent in the background. Resolves with the running run as soon as it is started.
     * Throws InvalidQuestionError, ChatSessionNotFoundError or RunConflictError (nothing started).
     */
    async execute(props: RunInputProps, observer: RunObserver): Promise<AgentRun> {
        const input = this.normalize(props);

        const session = await this.sessions.findById(input.threadId);
        if (session === null) throw new ChatSessionNotFoundError(input.threadId);

        const run = this.registry.tryStart(input.threadId, input.runId);
        if (run === null) throw new RunConflictError(input.threadId);

        try {
            await this.sessions.appendUserMessage(input.threadId, input.question);
        } catch (error) {
            this.registry.release(input.threadId, input.runId);
            throw error;
        }

        void this.drive(run, session, input, observer);
        return run;
    }

    private normalize(props: RunInputProps): RunInput {
        try {
            return RunInput.of(props);
        } catch (error) {
            if (error instanceof InvalidRunInputError) {
                throw new InvalidQuestionError(error.message);
            }
            throw error;
        }
    }

    /** Never rejects: every outcome ends with a terminal event, release and close. */
    private async drive(
        run: AgentRun,
        session: ChatSession,
        input: RunInput,
        observer: RunObserver,
    ): Promise<void> {
        let finalized = false;
        const finalize = async (terminal: AgentEvent): Promise<void> => {
            if (finalized) return;
            finalized = true;
            const settled = await this.settle(run, session, input, terminal);
            this.registry.release(input.threadId, input.runId);
            this.forward(observer, settled);
        };

        try {
            for await (const event of this.assistant.stream(input, run.signal)) {
                if (AgentEvent.isTerminal(event)) {
                    await finalize(event);
                    break;
                }
                this.forward(observer, event);
            }
            await finalize(AgentEvent.runFailed('Agent stream ended without a result'));
        } catch (error) {
            await finalize(
                run.signal.aborted
                    ? AgentEvent.runCancelled()
                    : AgentEvent.runFailed(error instanceof Error ? error.message : String(error)),
            ).catch(() => undefined);
        } finally {
            this.registry.release(input.threadId, input.runId);
            await this.dropThreadIfSessionGone(input.threadId);
            try {
                observer.close();
            } catch {
                // the observer's problem, the run is already over
            }
        }
    }

    /** Stores the answer of a finished run and moves the run to its terminal status. */
    private async settle(
        run: AgentRun,
        session: ChatSession,
        input: RunInput,
        terminal: AgentEvent,
    ): Promise<AgentEvent> {
        let result = terminal;
        if (terminal.type === 'run-finished') {
            try {
                await this.sessions.appendAgentAnswer(
                    input.threadId,
                    {
                        answer: terminal.answer,
                        toolCalls: terminal.toolCalls,
                        durationMs: terminal.durationMs,
                    },
                    session.proposeAutoTitle(input.question),
                );
            } catch (error) {
                result = AgentEvent.runFailed(
                    error instanceof Error ? error.message : 'Failed to store the answer',
                );
            }
        }
        if (run.status === 'running') {
            if (result.type === 'run-finished') run.finish();
            else if (result.type === 'run-cancelled') run.cancel();
            else run.fail();
        }
        return result;
    }

    private forward(observer: RunObserver, event: AgentEvent): void {
        try {
            observer.next(event);
        } catch {
            // a broken observer must not stop the run
        }
    }

    /** The chat may be deleted while the agent works; its checkpoints must not outlive it. */
    private async dropThreadIfSessionGone(threadId: string): Promise<void> {
        try {
            if ((await this.sessions.findById(threadId)) === null) {
                await this.threads.deleteThread(threadId);
            }
        } catch {
            // best effort
        }
    }
}
