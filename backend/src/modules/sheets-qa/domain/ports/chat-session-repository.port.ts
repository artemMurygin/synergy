import type { ChatMessage } from '../chat-message';
import type { ChatSession } from '../chat-session';
import type { ChatTitle } from '../chat-title';
import type { AssistantAnswer } from './sheets-assistant.port';

/**
 * Storage of chats and their message history.
 * Methods that need an existing session throw ChatSessionNotFoundError for an unknown id.
 */
export abstract class ChatSessionRepositoryPort {
    abstract create(session: ChatSession): Promise<ChatSession>;
    abstract findById(id: string): Promise<ChatSession | null>;
    /** Sorted by lastActivityAt, newest first. */
    abstract list(): Promise<ChatSession[]>;
    /** Chronological order. */
    abstract listMessages(sessionId: string): Promise<ChatMessage[]>;
    abstract appendUserMessage(sessionId: string, text: string): Promise<ChatMessage>;
    /**
     * One transaction: the agent message, lastActivityAt and (when given and the title
     * is not custom) the auto title.
     */
    abstract appendAgentAnswer(
        sessionId: string,
        answer: AssistantAnswer,
        autoTitle?: ChatTitle,
    ): Promise<ChatMessage>;
    /** Marks the title as custom; does not touch lastActivityAt. */
    abstract rename(sessionId: string, title: ChatTitle): Promise<ChatSession>;
    /** Removes the session with all its messages. */
    abstract delete(sessionId: string): Promise<void>;
}
