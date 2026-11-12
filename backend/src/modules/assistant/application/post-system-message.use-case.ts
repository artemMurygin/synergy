import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import { ChatSystemMessagePostedEvent } from '../contracts/chat-system-message-posted.event';
import type { SystemMessageCommand } from '../contracts/system-message.command';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import { AgentContextWriterPort } from '../domain/ports/agent-context-writer.port';
import { AttachmentFilesPort } from '../domain/ports/attachment-files.port';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import { ChatThreadPort } from '../domain/ports/chat-thread.port';
import { RunInProgressError } from '../domain/run-in-progress.error';
import { formatAttachmentsBlock } from '../domain/run-input';

export type PostSystemMessageOutcome = 'posted' | 'duplicate' | 'skipped';

/**
 * Adds a message of the agent to a chat without a question: to the agent context first, then to
 * the history. It is not a run: it never takes the run slot and waits (by retry) while one is active.
 */
@Injectable()
export class PostSystemMessageUseCase {
    constructor(
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly registry: ActiveRunRegistryPort,
        private readonly context: AgentContextWriterPort,
        private readonly threads: ChatThreadPort,
        private readonly files: AttachmentFilesPort,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(PostSystemMessageUseCase.name);
    }

    async execute(command: SystemMessageCommand): Promise<PostSystemMessageOutcome> {
        const { sessionId, ownerId, dedupKey } = command;
        const session = await this.sessions.findOwned(sessionId, ownerId);
        // A deleted chat is never restored; system messages go only to app chats.
        if (session?.channel !== 'app') return 'skipped';
        // Must not get inside the current answer: the queue retries after a delay.
        if (this.registry.isRunning(sessionId)) throw new RunInProgressError(sessionId);
        // A redelivery must not add a second copy to the agent context.
        if (await this.sessions.hasDedupKey(dedupKey)) return 'duplicate';

        const attachments =
            command.attachments.length === 0
                ? []
                : await this.files.findOwned(ownerId, command.attachments);
        const agentText =
            attachments.length === 0
                ? command.text
                : `${command.text}\n\n${formatAttachmentsBlock(attachments)}`;

        // Checkpointer first: a lost message in the agent context is worse than a duplicate there.
        await this.context.appendAssistantMessage(sessionId, agentText);

        try {
            return await this.transactions.run(async () => {
                const message = await this.sessions.appendSystemMessage(sessionId, ownerId, {
                    text: command.text,
                    attachments: command.attachments,
                    dedupKey,
                });
                if (message === null) return 'duplicate';
                await this.events.publish([
                    new ChatSystemMessagePostedEvent({
                        aggregateId: sessionId,
                        ownerId,
                        messageId: message.id,
                        topic: command.topic,
                        subject: command.subject,
                    }),
                ]);
                return 'posted';
            });
        } catch (error) {
            if (!(error instanceof ChatSessionNotFoundError)) throw error;
            // The chat was deleted after the check: drop the context written for it.
            await this.dropThread(sessionId);
            return 'skipped';
        }
    }

    private async dropThread(sessionId: string): Promise<void> {
        try {
            await this.threads.deleteThread(sessionId);
        } catch (err) {
            this.logger.warn(
                { err, sessionId },
                'Dropping the agent thread of a deleted chat failed',
            );
        }
    }
}
