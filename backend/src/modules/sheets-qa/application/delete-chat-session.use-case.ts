import { Injectable } from '@nestjs/common';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import { ChatThreadPort } from '../domain/ports/chat-thread.port';

@Injectable()
export class DeleteChatSessionUseCase {
    constructor(
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly threads: ChatThreadPort,
    ) {}

    /**
     * Throws ChatSessionNotFoundError. The agent thread is cleared first (idempotent): if that
     * fails the session stays and the delete can be retried; a repeated delete of an already
     * removed session still cleans leftover thread data.
     */
    async execute(sessionId: string): Promise<void> {
        await this.threads.deleteThread(sessionId);
        await this.sessions.delete(sessionId);
    }
}
