import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AgentEvent, RUN_FAILED_PUBLIC_MESSAGE } from '../domain/agent-event';
import type { AgentRun } from '../domain/agent-run';
import type { ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import { AttachmentFilesPort } from '../domain/ports/attachment-files.port';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import { ChatThreadPort } from '../domain/ports/chat-thread.port';
import type { AppClientId } from '../domain/client-id';
import { AgentRunnerPort, type AgentRunScope } from '../domain/ports/agent-runner.port';
import { findAppSession } from './find-app-session';
import { RunConflictError } from '../domain/run-conflict.error';
import { InvalidRunInputError, RunInput } from '../domain/run-input';

export { MAX_QUESTION_LENGTH } from '../domain/run-input';

export class InvalidQuestionError extends Error {}

export interface StartAgentRunProps {
    readonly threadId: string;
    readonly runId: string;
    readonly question: string;
    /** Ids of the user's uploaded files attached to the message. */
    readonly fileIds?: readonly string[];
}

export interface RunObserver {
    next(event: AgentEvent): void;
    close(): void;
}

@Injectable()
export class StartAgentRunUseCase {
    constructor(
        private readonly assistant: AgentRunnerPort,
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly threads: ChatThreadPort,
        private readonly registry: ActiveRunRegistryPort,
        private readonly files: AttachmentFilesPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(StartAgentRunUseCase.name);
    }

    async execute(
        ownerId: string,
        props: StartAgentRunProps,
        observer: RunObserver,
        client: AppClientId = 'app',
    ): Promise<AgentRun> {
        const fileIds = props.fileIds ?? [];
        this.guard(() => {
            RunInput.assertDraft({
                threadId: props.threadId,
                question: props.question,
                fileCount: fileIds.length,
            });
        });

        const session = await findAppSession(this.sessions, ownerId, props.threadId);
        // Checked before the stream: a foreign, unknown or deleted file stops the run with no writes.
        const attachments =
            fileIds.length === 0 ? [] : await this.files.findOwned(ownerId, fileIds);
        const input = this.guard(() => RunInput.of({ ...props, attachments }));

        const run = this.registry.tryStart(input.threadId, input.runId);
        if (run === null) throw new RunConflictError(input.threadId);

        try {
            await this.sessions.appendUserMessage(
                input.threadId,
                ownerId,
                input.question,
                input.attachments.map((file) => file.fileId),
            );
        } catch (error) {
            this.registry.release(input.threadId, input.runId);
            if ((await this.sessions.findById(input.threadId)) === null) {
                throw new ChatSessionNotFoundError(input.threadId);
            }
            throw error;
        }

        void this.drive(run, session, input, observer, { userId: ownerId, client });
        return run;
    }

    private guard<T>(validate: () => T): T {
        try {
            return validate();
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
        scope: AgentRunScope,
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
            for await (const event of this.assistant.stream(input, run.signal, scope)) {
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
                    session.ownerId,
                    {
                        answer: terminal.answer,
                        toolCalls: terminal.toolCalls,
                        durationMs: terminal.durationMs,
                        attachments: terminal.attachments.map((file) => file.fileId),
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
