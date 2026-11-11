import type { ChatMessage } from '../chat-message';
import type { ChatSession } from '../chat-session';
import type { ChatTitle } from '../chat-title';
import type { AssistantAnswer } from './agent-runner.port';

/**
 * Storage of chats and their message history.
 * Operations on one chat take the owner and throw ChatSessionNotFoundError for an unknown
 * and for a foreign chat alike.
 */
export abstract class ChatSessionRepositoryPort {
    abstract create(session: ChatSession): Promise<ChatSession>;
    abstract findById(id: string): Promise<ChatSession | null>;
    /** Null for a foreign and for a non-existent chat alike. */
    abstract findOwned(id: string, ownerId: string): Promise<ChatSession | null>;
    /** Chats of the owner in the `app` channel, sorted by lastActivityAt, newest first. */
    abstract list(ownerId: string): Promise<ChatSession[]>;
    /** The single `telegram` dialog of the owner; created on first use. */
    abstract findOrCreateTelegram(ownerId: string): Promise<ChatSession>;
    /** The `telegram` dialog of the owner, or null when there is none; never creates one. */
    abstract findTelegram(ownerId: string): Promise<ChatSession | null>;
    /** Chronological order. */
    abstract listMessages(sessionId: string, ownerId: string): Promise<ChatMessage[]>;
    abstract appendUserMessage(
        sessionId: string,
        ownerId: string,
        text: string,
    ): Promise<ChatMessage>;
    /**
     * One transaction: the agent message, lastActivityAt and (when given and the title
     * is not custom) the auto title.
     */
    abstract appendAgentAnswer(
        sessionId: string,
        ownerId: string,
        answer: AssistantAnswer,
        autoTitle?: ChatTitle,
    ): Promise<ChatMessage>;
    /** Marks the title as custom; does not touch lastActivityAt. */
    abstract rename(sessionId: string, ownerId: string, title: ChatTitle): Promise<ChatSession>;
    /** Removes the session with all its messages. */
    abstract delete(sessionId: string, ownerId: string): Promise<void>;
}
