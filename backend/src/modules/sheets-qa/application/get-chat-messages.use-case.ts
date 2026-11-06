import { Injectable } from '@nestjs/common';
import type { ChatMessage } from '../domain/chat-message';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';

@Injectable()
export class GetChatMessagesUseCase {
    constructor(private readonly sessions: ChatSessionRepositoryPort) {}

    /** Throws ChatSessionNotFoundError for an unknown session. */
    execute(sessionId: string): Promise<ChatMessage[]> {
        return this.sessions.listMessages(sessionId);
    }
}
