import { Injectable } from '@nestjs/common';
import type { ChatSession } from '../domain/chat-session';
import { ChatTitle } from '../domain/chat-title';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';

@Injectable()
export class RenameChatSessionUseCase {
    constructor(private readonly sessions: ChatSessionRepositoryPort) {}

    /** Throws InvalidChatTitleError or ChatSessionNotFoundError. */
    async execute(sessionId: string, title: string): Promise<ChatSession> {
        return this.sessions.rename(sessionId, ChatTitle.of(title));
    }
}
