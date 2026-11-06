import { Injectable } from '@nestjs/common';
import type { ChatMessage } from '../domain/chat-message';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';

export interface ChatHistory {
    readonly messages: ChatMessage[];
    /** An agent run is active in the chat right now. */
    readonly running: boolean;
}

@Injectable()
export class GetChatMessagesUseCase {
    constructor(
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly registry: ActiveRunRegistryPort,
    ) {}

    /**
     * Throws ChatSessionNotFoundError for an unknown session. The flag is read after the
     * history: a run releases its registry entry only after the answer is stored, so a
     * history without the answer never comes with `running: false` of the same run.
     */
    async execute(sessionId: string): Promise<ChatHistory> {
        const messages = await this.sessions.listMessages(sessionId);
        return { messages, running: this.registry.isRunning(sessionId) };
    }
}
