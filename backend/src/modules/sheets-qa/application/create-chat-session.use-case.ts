import { Injectable } from '@nestjs/common';
import { ChatSession } from '../domain/chat-session';
import { ChatTitle } from '../domain/chat-title';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';

@Injectable()
export class CreateChatSessionUseCase {
    constructor(private readonly sessions: ChatSessionRepositoryPort) {}

    async execute(title?: string): Promise<ChatSession> {
        const session = ChatSession.create(title === undefined ? undefined : ChatTitle.of(title));
        return this.sessions.create(session);
    }
}
