import { Injectable } from '@nestjs/common';
import type { ChatSession } from '../domain/chat-session';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';

@Injectable()
export class ListChatSessionsUseCase {
    constructor(private readonly sessions: ChatSessionRepositoryPort) {}

    execute(): Promise<ChatSession[]> {
        return this.sessions.list();
    }
}
