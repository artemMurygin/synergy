import type { ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import type { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';

/**
 * The chat of the owner that client applications may use. A foreign chat, a missing one and
 * the Telegram dialog of the owner are indistinguishable: all fail with not found.
 */
export async function findAppSession(
    sessions: ChatSessionRepositoryPort,
    ownerId: string,
    sessionId: string,
): Promise<ChatSession> {
    const session = await sessions.findOwned(sessionId, ownerId);
    if (session?.channel !== 'app') {
        throw new ChatSessionNotFoundError(sessionId);
    }
    return session;
}
