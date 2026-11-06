import type { AuthSession } from '../auth-session';

export abstract class AuthSessionRepository {
    /** Locks the session row for update within the current transaction. */
    abstract findByTokenHash(tokenHash: string): Promise<AuthSession | null>;
    abstract findById(id: string): Promise<AuthSession | null>;
    /** Like findById, but locks the session row until the current transaction ends. */
    abstract findByIdForUpdate(id: string): Promise<AuthSession | null>;
    abstract save(session: AuthSession): Promise<void>;
    abstract revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void>;
}
