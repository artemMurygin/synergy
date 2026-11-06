import { Injectable } from '@nestjs/common';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import { ChatThreadPort } from '../domain/ports/chat-thread.port';

@Injectable()
export class DeleteChatSessionUseCase {
    constructor(
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly threads: ChatThreadPort,
        private readonly registry: ActiveRunRegistryPort,
    ) {}

    /**
     * An active run is cancelled first, so its answer is never stored for a deleted chat.
     * Throws ChatSessionNotFoundError. The agent thread is cleared first (idempotent): if that
     * fails the session stays and the delete can be retried; a repeated delete of an already
     * removed session still cleans leftover thread data.
     */
    async execute(sessionId: string): Promise<void> {
        this.registry.cancel(sessionId);
        await this.threads.deleteThread(sessionId);
        await this.sessions.delete(sessionId);
    }
}
