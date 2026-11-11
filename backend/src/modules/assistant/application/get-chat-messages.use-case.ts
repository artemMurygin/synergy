import { Injectable } from '@nestjs/common';
import type { ChatMessage } from '../domain/chat-message';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import { findAppSession } from './find-app-session';

export interface ChatHistory {
    readonly messages: ChatMessage[];
    readonly running: boolean;
}

@Injectable()
export class GetChatMessagesUseCase {
    constructor(
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly registry: ActiveRunRegistryPort,
    ) {}

    /** Throws ChatSessionNotFoundError for a chat the owner cannot use. */
    async execute(ownerId: string, sessionId: string): Promise<ChatHistory> {
        await findAppSession(this.sessions, ownerId, sessionId);
        // Read the flag first: a run releases its entry only after the answer is stored,
        // so a history read afterwards never lacks the answer of a run reported as finished.
        const running = this.registry.isRunning(sessionId);
        const messages = await this.sessions.listMessages(sessionId, ownerId);
        return { messages, running };
    }
}
