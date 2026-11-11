import { Injectable } from '@nestjs/common';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import { findAppSession } from './find-app-session';

@Injectable()
export class CancelAgentRunUseCase {
    constructor(
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly registry: ActiveRunRegistryPort,
    ) {}

    /** Throws ChatSessionNotFoundError for a chat the owner cannot use; a chat without a run is a no-op. */
    async execute(ownerId: string, threadId: string): Promise<void> {
        await findAppSession(this.sessions, ownerId, threadId);
        this.registry.cancel(threadId);
    }
}
