import { Injectable } from '@nestjs/common';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import { ChatThreadPort } from '../domain/ports/chat-thread.port';

/**
 * Starts a new Telegram dialog of the owner: removes the current one with its history and
 * the agent context. Idempotent: without a dialog it does nothing.
 */
@Injectable()
export class ResetTelegramDialogUseCase {
    constructor(
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly threads: ChatThreadPort,
        private readonly registry: ActiveRunRegistryPort,
    ) {}

    async execute(ownerId: string): Promise<void> {
        const dialog = await this.sessions.findTelegram(ownerId);
        if (dialog === null) return;
        this.registry.cancel(dialog.id);
        // Thread first: if clearing fails the session stays and the reset can be retried.
        await this.threads.deleteThread(dialog.id);
        try {
            await this.sessions.delete(dialog.id, ownerId);
        } catch (error: unknown) {
            // A concurrent reset already removed it: the outcome is the same.
            if (!(error instanceof ChatSessionNotFoundError)) throw error;
        }
    }
}
