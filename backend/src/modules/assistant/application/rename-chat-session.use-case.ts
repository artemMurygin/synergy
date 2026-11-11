import { Injectable } from '@nestjs/common';
import type { ChatSession } from '../domain/chat-session';
import { ChatTitle } from '../domain/chat-title';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import { findAppSession } from './find-app-session';

@Injectable()
export class RenameChatSessionUseCase {
    constructor(private readonly sessions: ChatSessionRepositoryPort) {}

    /** Throws InvalidChatTitleError or ChatSessionNotFoundError. */
    async execute(ownerId: string, sessionId: string, title: string): Promise<ChatSession> {
        const newTitle = ChatTitle.of(title);
        await findAppSession(this.sessions, ownerId, sessionId);
        return this.sessions.rename(sessionId, ownerId, newTitle);
    }
}
