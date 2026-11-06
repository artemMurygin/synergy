import { InvalidRefreshTokenError } from './errors';
import type { NewRefreshToken, RefreshToken } from './refresh-token';

export type RotationResult =
    { kind: 'Rotated'; token: RefreshToken } | { kind: 'Race' } | { kind: 'ReuseDetected' };

export interface AuthSessionProps {
    id: string;
    userId: string;
    createdAt: Date;
    revokedAt: Date | null;
    tokens: RefreshToken[];
}

export class AuthSession {
    private constructor(private readonly props: AuthSessionProps) {}

    static start(input: {
        id: string;
        userId: string;
        now: Date;
        firstToken: NewRefreshToken;
    }): AuthSession {
        return new AuthSession({
            id: input.id,
            userId: input.userId,
            createdAt: input.now,
            revokedAt: null,
            tokens: [{ ...input.firstToken, usedAt: null, replacedById: null }],
        });
    }

    static restore(props: AuthSessionProps): AuthSession {
        return new AuthSession({ ...props, tokens: props.tokens.map((t) => ({ ...t })) });
    }

    get id(): string {
        return this.props.id;
    }
    get userId(): string {
        return this.props.userId;
    }
    get createdAt(): Date {
        return this.props.createdAt;
    }
    get revokedAt(): Date | null {
        return this.props.revokedAt;
    }
    get tokens(): readonly RefreshToken[] {
        return this.props.tokens;
    }

    isRevoked(): boolean {
        return this.props.revokedAt !== null;
    }

    activeToken(): RefreshToken | null {
        if (this.isRevoked()) return null;
        return this.props.tokens.find((t) => t.usedAt === null) ?? null;
    }

    /**
     * Presents a token hash. On success marks it used and appends `next`.
     * A reused token inside the grace window is a Race; outside it the session is revoked.
     * @throws InvalidRefreshTokenError for a revoked session, unknown or expired token.
     */
    rotate(presented: string, next: NewRefreshToken, now: Date, graceMs: number): RotationResult {
        if (this.isRevoked()) throw new InvalidRefreshTokenError();
        const token = this.props.tokens.find((t) => t.tokenHash === presented);
        if (token === undefined) throw new InvalidRefreshTokenError();

        if (token.usedAt !== null) {
            if (now.getTime() - token.usedAt.getTime() <= graceMs) return { kind: 'Race' };
            this.revoke(now);
            return { kind: 'ReuseDetected' };
        }
        if (token.expiresAt.getTime() <= now.getTime()) throw new InvalidRefreshTokenError();

        const created: RefreshToken = { ...next, usedAt: null, replacedById: null };
        token.usedAt = now;
        token.replacedById = next.id;
        this.props.tokens.push(created);
        return { kind: 'Rotated', token: created };
    }

    revoke(now: Date): void {
        if (this.props.revokedAt !== null) return;
        this.props.revokedAt = now;
    }
}
