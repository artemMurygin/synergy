import { ChatMessage } from '../../../domain/chat-message';
import { ChatSession } from '../../../domain/chat-session';
import { ChatSessionNotFoundError } from '../../../domain/chat-session-not-found.error';
import type { ChatTitle } from '../../../domain/chat-title';
import { MessageAttachment, type MessageAttachmentProps } from '../../../domain/message-attachment';
import {
    ChatSessionRepositoryPort,
    type SystemMessageInput,
} from '../../../domain/ports/chat-session-repository.port';
import type { AssistantAnswer } from '../../../domain/ports/agent-runner.port';

type FileFacts = Omit<MessageAttachmentProps, 'fileId' | 'position'>;

const UNKNOWN_FILE: FileFacts = {
    name: 'file',
    mediaType: 'application/octet-stream',
    kind: 'document',
    sizeBytes: 1,
    status: 'active',
};

/** Test double of the chat repository shared by the controller specs. */
export class InMemoryChatSessionRepository extends ChatSessionRepositoryPort {
    sessions = new Map<string, ChatSession>();
    messages = new Map<string, ChatMessage[]>();
    /** Facts of stored files by id, as the history would read them from stored_file. */
    files = new Map<string, FileFacts>();
    private nextId = 1;

    private attach(fileIds: readonly string[] = []): MessageAttachment[] {
        return fileIds.map((fileId, position) =>
            MessageAttachment.of({
                ...(this.files.get(fileId) ?? UNKNOWN_FILE),
                fileId,
                position,
            }),
        );
    }

    create(session: ChatSession): Promise<ChatSession> {
        this.sessions.set(session.id, session);
        this.messages.set(session.id, []);
        return Promise.resolve(session);
    }
    findById(id: string): Promise<ChatSession | null> {
        return Promise.resolve(this.sessions.get(id) ?? null);
    }
    findOwned(id: string, ownerId: string): Promise<ChatSession | null> {
        const session = this.sessions.get(id);
        return Promise.resolve(session?.ownerId === ownerId ? session : null);
    }
    list(ownerId: string): Promise<ChatSession[]> {
        return Promise.resolve(
            [...this.sessions.values()]
                .filter((s) => s.ownerId === ownerId && s.channel === 'app')
                .reverse(),
        );
    }
    async findOrCreateTelegram(ownerId: string): Promise<ChatSession> {
        const existing = await this.findTelegram(ownerId);
        return existing ?? this.create(ChatSession.create({ ownerId, channel: 'telegram' }));
    }
    findTelegram(ownerId: string): Promise<ChatSession | null> {
        const found = [...this.sessions.values()].find(
            (s) => s.ownerId === ownerId && s.channel === 'telegram',
        );
        return Promise.resolve(found ?? null);
    }
    listMessages(sessionId: string, ownerId: string): Promise<ChatMessage[]> {
        return this.require(sessionId, ownerId, () => this.messages.get(sessionId) ?? []);
    }
    appendUserMessage(
        sessionId: string,
        ownerId: string,
        text: string,
        attachments: readonly string[] = [],
    ): Promise<ChatMessage> {
        return this.require(sessionId, ownerId, () => {
            const message = ChatMessage.user({
                id: this.nextId++,
                sessionId,
                text,
                createdAt: new Date(),
                attachments: this.attach(attachments),
            });
            this.messages.get(sessionId)?.push(message);
            return message;
        });
    }
    appendAgentAnswer(
        sessionId: string,
        ownerId: string,
        answer: AssistantAnswer,
        autoTitle?: ChatTitle,
    ): Promise<ChatMessage> {
        return this.require(sessionId, ownerId, () => {
            const message = ChatMessage.agent({
                id: this.nextId++,
                sessionId,
                text: answer.answer,
                toolCalls: answer.toolCalls,
                durationMs: answer.durationMs,
                createdAt: new Date(),
                attachments: this.attach(answer.attachments),
            });
            this.messages.get(sessionId)?.push(message);
            const session = this.sessions.get(sessionId);
            if (session && autoTitle) this.sessions.set(sessionId, session.rename(autoTitle));
            return message;
        });
    }
    appendSystemMessage(
        sessionId: string,
        ownerId: string,
        input: SystemMessageInput,
    ): Promise<ChatMessage | null> {
        return this.require(sessionId, ownerId, () => {
            const all = [...this.messages.values()].flat();
            if (all.some((m) => m.dedupKey === input.dedupKey)) return null;
            const message = ChatMessage.system({
                id: this.nextId++,
                sessionId,
                text: input.text,
                dedupKey: input.dedupKey,
                createdAt: new Date(),
                attachments: this.attach(input.attachments),
            });
            this.messages.get(sessionId)?.push(message);
            return message;
        });
    }
    hasDedupKey(dedupKey: string): Promise<boolean> {
        const all = [...this.messages.values()].flat();
        return Promise.resolve(all.some((m) => m.dedupKey === dedupKey));
    }
    findFirstSessionWithFile(fileId: string, ownerId: string): Promise<string | null> {
        const found = [...this.messages.values()]
            .flat()
            .filter(
                (m) =>
                    m.role === 'user' &&
                    this.sessions.get(m.sessionId)?.ownerId === ownerId &&
                    m.attachments.some((a) => a.fileId === fileId),
            )
            .sort((a, b) => a.id - b.id)
            .at(0);
        return Promise.resolve(found?.sessionId ?? null);
    }
    rename(sessionId: string, ownerId: string, title: ChatTitle): Promise<ChatSession> {
        return this.require(sessionId, ownerId, () => {
            const renamed = this.sessions.get(sessionId)?.rename(title);
            if (!renamed) throw new ChatSessionNotFoundError(sessionId);
            this.sessions.set(sessionId, renamed);
            return renamed;
        });
    }
    delete(sessionId: string, ownerId: string): Promise<void> {
        return this.require(sessionId, ownerId, () => {
            this.sessions.delete(sessionId);
            this.messages.delete(sessionId);
        });
    }
    private require<T>(sessionId: string, ownerId: string, action: () => T): Promise<T> {
        if (this.sessions.get(sessionId)?.ownerId !== ownerId)
            return Promise.reject(new ChatSessionNotFoundError(sessionId));
        return Promise.resolve(action());
    }
}
