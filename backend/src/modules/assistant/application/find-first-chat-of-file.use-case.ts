import { Injectable } from '@nestjs/common';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';

export interface FindFirstChatOfFileInput {
    readonly ownerId: string;
    readonly fileId: string;
}

/**
 * Contract of the assistant module: the chat where the owner first sent the file. Null when the
 * file was never sent to a chat or every such chat is deleted: a system message is not posted then.
 */
@Injectable()
export class FindFirstChatOfFileUseCase {
    constructor(private readonly sessions: ChatSessionRepositoryPort) {}

    execute({ ownerId, fileId }: FindFirstChatOfFileInput): Promise<string | null> {
        return this.sessions.findFirstSessionWithFile(fileId, ownerId);
    }
}
