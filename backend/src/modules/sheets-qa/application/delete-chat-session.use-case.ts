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

    async execute(sessionId: string): Promise<void> {
        this.registry.cancel(sessionId);
        // Thread first: if clearing fails the session stays and the delete can be retried.
        await this.threads.deleteThread(sessionId);
        await this.sessions.delete(sessionId);
    }
}
