import { Injectable } from '@nestjs/common';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import { ChatThreadPort } from '../domain/ports/chat-thread.port';
import { findAppSession } from './find-app-session';

@Injectable()
export class DeleteChatSessionUseCase {
    constructor(
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly threads: ChatThreadPort,
        private readonly registry: ActiveRunRegistryPort,
    ) {}

    /** Throws ChatSessionNotFoundError for a chat the owner cannot use, before any side effect. */
    async execute(ownerId: string, sessionId: string): Promise<void> {
        await findAppSession(this.sessions, ownerId, sessionId);
        this.registry.cancel(sessionId);
        // Thread first: if clearing fails the session stays and the delete can be retried.
        await this.threads.deleteThread(sessionId);
        await this.sessions.delete(sessionId, ownerId);
    }
}
