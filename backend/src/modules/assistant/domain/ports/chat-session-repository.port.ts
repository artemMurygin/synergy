import type { ChatMessage } from '../chat-message';
import type { ChatSession } from '../chat-session';
import type { ChatTitle } from '../chat-title';
import type { AssistantAnswer } from './agent-runner.port';

export interface SystemMessageInput {
    readonly text: string;
    /** Ids of files of the chat owner, in the order of display. */
    readonly attachments: readonly string[];
    readonly dedupKey: string;
}

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
    /** The attachments are ids of checked files, stored in the given order. */
    abstract appendUserMessage(
        sessionId: string,
        ownerId: string,
        text: string,
        attachments?: readonly string[],
    ): Promise<ChatMessage>;
    /**
     * One transaction: the agent message with its attachments, lastActivityAt and (when given
     * and the title is not custom) the auto title.
     */
    abstract appendAgentAnswer(
        sessionId: string,
        ownerId: string,
        answer: AssistantAnswer,
        autoTitle?: ChatTitle,
    ): Promise<ChatMessage>;
    /**
     * One transaction (joins the caller's one): an agent message with the `system` source and
     * lastActivityAt. Null when a message with this dedupKey already exists.
     */
    abstract appendSystemMessage(
        sessionId: string,
        ownerId: string,
        message: SystemMessageInput,
    ): Promise<ChatMessage | null>;
    /** Whether a message with this idempotency key exists in any chat. */
    abstract hasDedupKey(dedupKey: string): Promise<boolean>;
    /**
     * The first existing chat of the owner where the file was attached to a question;
     * null when there is none (a deleted chat takes its attachments with it).
     */
    abstract findFirstSessionWithFile(fileId: string, ownerId: string): Promise<string | null>;
    /** Marks the title as custom; does not touch lastActivityAt. */
    abstract rename(sessionId: string, ownerId: string, title: ChatTitle): Promise<ChatSession>;
    /** Removes the session with all its messages. */
    abstract delete(sessionId: string, ownerId: string): Promise<void>;
}
