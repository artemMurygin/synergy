import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AgentEvent } from '../domain/agent-event';
import type { AgentRun } from '../domain/agent-run';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import { AgentRunnerPort } from '../domain/ports/agent-runner.port';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import { InvalidRunInputError, RunInput } from '../domain/run-input';

export const TELEGRAM_BUSY_MESSAGE = 'Пожалуйста, подождите ответа на предыдущее сообщение.';
export const TELEGRAM_FAILED_MESSAGE =
    'Не удалось обработать сообщение. Попробуйте отправить его ещё раз.';
export const TELEGRAM_TOO_LONG_MESSAGE =
    'Сообщение слишком длинное. Сократите его и отправьте ещё раз.';

/**
 * One message of the owner to the agent of the Telegram dialog. The dialog is separate from
 * the chats of the applications: it is not listed there and their history is never read.
 * Every outcome is returned as the text for the user, failures never throw.
 */
@Injectable()
export class AskInTelegramUseCase {
    constructor(
        private readonly runner: AgentRunnerPort,
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly registry: ActiveRunRegistryPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(AskInTelegramUseCase.name);
    }

    async execute(ownerId: string, text: string): Promise<string> {
        let threadId: string | undefined;
        let runId: string | undefined;
        try {
            const session = await this.sessions.findOrCreateTelegram(ownerId);
            threadId = session.id;
            runId = randomUUID();

            let input: RunInput;
            try {
                input = RunInput.of({ threadId, runId, question: text });
            } catch (error) {
                if (error instanceof InvalidRunInputError) return TELEGRAM_TOO_LONG_MESSAGE;
                throw error;
            }

            const run = this.registry.tryStart(threadId, runId);
            if (run === null) {
                threadId = undefined;
                return TELEGRAM_BUSY_MESSAGE;
            }

            await this.sessions.appendUserMessage(threadId, ownerId, input.question);
            return await this.drive(run, input, ownerId);
        } catch (err) {
            this.logger.error({ err, threadId, runId }, 'Telegram agent message failed');
            return TELEGRAM_FAILED_MESSAGE;
        } finally {
            if (threadId !== undefined && runId !== undefined) {
                this.registry.release(threadId, runId);
            }
        }
    }

    private async drive(run: AgentRun, input: RunInput, ownerId: string): Promise<string> {
        for await (const event of this.runner.stream(input, run.signal, {
            userId: ownerId,
            client: 'telegram',
        })) {
            if (!AgentEvent.isTerminal(event)) continue;
            if (event.type !== 'run-finished') {
                this.fail(run);
                return TELEGRAM_FAILED_MESSAGE;
            }
            await this.sessions.appendAgentAnswer(input.threadId, ownerId, {
                answer: event.answer,
                toolCalls: event.toolCalls,
                durationMs: event.durationMs,
            });
            run.finish();
            return event.answer;
        }
        this.fail(run);
        return TELEGRAM_FAILED_MESSAGE;
    }

    private fail(run: AgentRun): void {
        if (run.status === 'running') run.fail();
    }
}
