import { ChatMessage } from '../../../domain/chat-message';
import type { ChatSession } from '../../../domain/chat-session';
import { ChatSessionNotFoundError } from '../../../domain/chat-session-not-found.error';
import type { ChatTitle } from '../../../domain/chat-title';
import { ChatSessionRepositoryPort } from '../../../domain/ports/chat-session-repository.port';
import type { AssistantAnswer } from '../../../domain/ports/sheets-assistant.port';

/** Test double of the chat repository shared by the controller specs. */
export class InMemoryChatSessionRepository extends ChatSessionRepositoryPort {
    sessions = new Map<string, ChatSession>();
    messages = new Map<string, ChatMessage[]>();
    private nextId = 1;

    create(session: ChatSession): Promise<ChatSession> {
        this.sessions.set(session.id, session);
        this.messages.set(session.id, []);
        return Promise.resolve(session);
    }
    findById(id: string): Promise<ChatSession | null> {
        return Promise.resolve(this.sessions.get(id) ?? null);
    }
    list(): Promise<ChatSession[]> {
        return Promise.resolve([...this.sessions.values()].reverse());
    }
    listMessages(sessionId: string): Promise<ChatMessage[]> {
        return this.require(sessionId, () => this.messages.get(sessionId) ?? []);
    }
    appendUserMessage(sessionId: string, text: string): Promise<ChatMessage> {
        return this.require(sessionId, () => {
            const message = ChatMessage.user({
                id: this.nextId++,
                sessionId,
                text,
                createdAt: new Date(),
            });
            this.messages.get(sessionId)?.push(message);
            return message;
        });
    }
    appendAgentAnswer(
        sessionId: string,
        answer: AssistantAnswer,
        autoTitle?: ChatTitle,
    ): Promise<ChatMessage> {
        return this.require(sessionId, () => {
            const message = ChatMessage.agent({
                id: this.nextId++,
                sessionId,
                text: answer.answer,
                toolCalls: answer.toolCalls,
                durationMs: answer.durationMs,
                createdAt: new Date(),
            });
            this.messages.get(sessionId)?.push(message);
            const session = this.sessions.get(sessionId);
            if (session && autoTitle) this.sessions.set(sessionId, session.rename(autoTitle));
            return message;
        });
    }
    rename(sessionId: string, title: ChatTitle): Promise<ChatSession> {
        return this.require(sessionId, () => {
            const renamed = this.sessions.get(sessionId)?.rename(title);
            if (!renamed) throw new ChatSessionNotFoundError(sessionId);
            this.sessions.set(sessionId, renamed);
            return renamed;
        });
    }
    delete(sessionId: string): Promise<void> {
        return this.require(sessionId, () => {
            this.sessions.delete(sessionId);
            this.messages.delete(sessionId);
        });
    }
    private require<T>(sessionId: string, action: () => T): Promise<T> {
        if (!this.sessions.has(sessionId))
            return Promise.reject(new ChatSessionNotFoundError(sessionId));
        return Promise.resolve(action());
    }
}
