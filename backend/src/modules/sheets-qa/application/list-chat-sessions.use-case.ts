import { Injectable } from '@nestjs/common';
import type { ChatSession } from '../domain/chat-session';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';

export interface ChatSessionListItem {
    readonly session: ChatSession;
    /** An agent run is active in the chat right now. */
    readonly running: boolean;
}

@Injectable()
export class ListChatSessionsUseCase {
    constructor(
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly registry: ActiveRunRegistryPort,
    ) {}

    async execute(): Promise<ChatSessionListItem[]> {
        const sessions = await this.sessions.list();
        return sessions.map((session) => ({
            session,
            running: this.registry.isRunning(session.id),
        }));
    }
}
