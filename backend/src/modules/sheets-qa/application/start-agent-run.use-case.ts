import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AgentEvent, RUN_FAILED_PUBLIC_MESSAGE } from '../domain/agent-event';
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

export interface RunObserver {
    next(event: AgentEvent): void;
    close(): void;
}

@Injectable()
export class StartAgentRunUseCase {
    constructor(
        private readonly assistant: SheetsAssistantPort,
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly threads: ChatThreadPort,
        private readonly registry: ActiveRunRegistryPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(StartAgentRunUseCase.name);
    }

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
            if ((await this.sessions.findById(input.threadId)) === null) {
                throw new ChatSessionNotFoundError(input.threadId);
            }
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

    private async drive(
        run: AgentRun,
        session: ChatSession,
        input: RunInput,
        observer: RunObserver,
    ): Promise<void> {
        const { threadId, runId } = input;
        let isFinalized = false;
        const finalize = async (terminal: AgentEvent): Promise<void> => {
            if (isFinalized) return;
            isFinalized = true;
            const settled = await this.settle(run, session, input, terminal);
            this.registry.release(threadId, runId);
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
        } catch (err) {
            if (!run.signal.aborted) {
                this.logger.error({ err, runId, threadId }, 'Agent run failed');
            }
            try {
                await finalize(
                    run.signal.aborted
                        ? AgentEvent.runCancelled()
                        : AgentEvent.runFailed(RUN_FAILED_PUBLIC_MESSAGE),
                );
            } catch (finalizeErr) {
                this.logger.warn({ err: finalizeErr, runId, threadId }, 'Run finalization failed');
            }
        } finally {
            this.registry.release(threadId, runId);
            await this.dropThreadIfSessionGone(threadId);
            try {
                observer.close();
            } catch (err) {
                this.logger.warn({ err, runId, threadId }, 'Run observer close failed');
            }
        }
    }

    private async settle(
        run: AgentRun,
        session: ChatSession,
        input: RunInput,
        terminal: AgentEvent,
    ): Promise<AgentEvent> {
        let result = terminal;
        if (terminal.type === 'run-finished' && run.signal.aborted) {
            result = AgentEvent.runCancelled();
        } else if (terminal.type === 'run-finished') {
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
            } catch (err) {
                this.logger.error(
                    { err, runId: input.runId, threadId: input.threadId },
                    'Failed to store the agent answer',
                );
                result = AgentEvent.runFailed(RUN_FAILED_PUBLIC_MESSAGE);
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
        } catch (err) {
            this.logger.warn({ err, eventType: event.type }, 'Run observer rejected an event');
        }
    }

    private async dropThreadIfSessionGone(threadId: string): Promise<void> {
        try {
            if ((await this.sessions.findById(threadId)) === null) {
                await this.threads.deleteThread(threadId);
            }
        } catch (err) {
            this.logger.warn(
                { err, threadId },
                'Dropping the agent thread of a deleted chat failed',
            );
        }
    }
}
