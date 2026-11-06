import { Inject, Injectable } from '@nestjs/common';
import { sql, type DatabasePool } from 'slonik';
import { z } from 'zod';
import { PG_POOL } from '../../../database/postgres/database.constants';
import { AuthSession } from '../domain/auth-session';
import { AuthSessionRepository } from '../domain/ports/auth-session-repository.port';
import { SlonikTransactionRunner } from './slonik-transaction-runner';

const sessionRow = z.object({
    id: z.string(),
    user_id: z.string(),
    created_at: z.number(),
    revoked_at: z.number().nullable(),
});

const tokenRow = z.object({
    id: z.string(),
    token_hash: z.string(),
    expires_at: z.number(),
    used_at: z.number().nullable(),
    replaced_by_id: z.string().nullable(),
});

const SESSION_COLUMNS = sql.fragment`
    s.id, s.user_id,
    (extract(epoch FROM s.created_at) * 1000)::float8 AS created_at,
    (extract(epoch FROM s.revoked_at) * 1000)::float8 AS revoked_at`;

const toDate = (ms: number | null): Date | null => (ms === null ? null : new Date(ms));

@Injectable()
export class SlonikAuthSessionRepository extends AuthSessionRepository {
    constructor(
        @Inject(PG_POOL) _pool: DatabasePool,
        private readonly tx: SlonikTransactionRunner,
    ) {
        super();
    }

    /** FOR UPDATE keeps the row locked until the surrounding transaction ends. */
    async findByTokenHash(tokenHash: string): Promise<AuthSession | null> {
        const row = await this.tx.executor().maybeOne(sql.unsafe`
            SELECT ${SESSION_COLUMNS}
            FROM auth_sessions s
            WHERE s.id = (SELECT session_id FROM auth_refresh_tokens WHERE token_hash = ${tokenHash})
            FOR UPDATE OF s`);
        return row === null ? null : this.load(sessionRow.parse(row));
    }

    async findById(id: string): Promise<AuthSession | null> {
        const row = await this.tx.executor().maybeOne(sql.unsafe`
            SELECT ${SESSION_COLUMNS} FROM auth_sessions s WHERE s.id = ${id}`);
        return row === null ? null : this.load(sessionRow.parse(row));
    }

    async findByIdForUpdate(id: string): Promise<AuthSession | null> {
        const row = await this.tx.executor().maybeOne(sql.unsafe`
            SELECT ${SESSION_COLUMNS} FROM auth_sessions s WHERE s.id = ${id} FOR UPDATE OF s`);
        return row === null ? null : this.load(sessionRow.parse(row));
    }

    async save(session: AuthSession): Promise<void> {
        const db = this.tx.executor();
        await db.query(sql.unsafe`
            INSERT INTO auth_sessions (id, user_id, created_at, revoked_at)
            VALUES (${session.id}, ${session.userId}, ${sql.timestamp(session.createdAt)},
                    ${session.revokedAt === null ? null : sql.timestamp(session.revokedAt)})
            ON CONFLICT (id) DO UPDATE SET revoked_at = EXCLUDED.revoked_at`);
        for (const t of session.tokens) {
            await db.query(sql.unsafe`
                INSERT INTO auth_refresh_tokens (id, session_id, token_hash, expires_at, used_at)
                VALUES (${t.id}, ${session.id}, ${t.tokenHash}, ${sql.timestamp(t.expiresAt)},
                        ${t.usedAt === null ? null : sql.timestamp(t.usedAt)})
                ON CONFLICT (id) DO UPDATE SET used_at = EXCLUDED.used_at`);
        }
        for (const t of session.tokens) {
            if (t.replacedById === null) continue;
            await db.query(sql.unsafe`
                UPDATE auth_refresh_tokens SET replaced_by_id = ${t.replacedById} WHERE id = ${t.id}`);
        }
    }

    async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
        await this.tx.executor().query(sql.unsafe`
            UPDATE auth_sessions SET revoked_at = now()
            WHERE user_id = ${userId} AND revoked_at IS NULL
              AND (${exceptSessionId ?? null}::uuid IS NULL OR id <> ${exceptSessionId ?? null}::uuid)`);
    }

    private async load(row: z.infer<typeof sessionRow>): Promise<AuthSession> {
        const tokens = await this.tx.executor().any(sql.unsafe`
            SELECT id, token_hash,
                (extract(epoch FROM expires_at) * 1000)::float8 AS expires_at,
                (extract(epoch FROM used_at) * 1000)::float8 AS used_at,
                replaced_by_id
            FROM auth_refresh_tokens WHERE session_id = ${row.id}
            ORDER BY (used_at IS NULL), used_at, expires_at`);
        return AuthSession.restore({
            id: row.id,
            userId: row.user_id,
            createdAt: new Date(row.created_at),
            revokedAt: toDate(row.revoked_at),
            tokens: tokens.map((raw) => {
                const t = tokenRow.parse(raw);
                return {
                    id: t.id,
                    tokenHash: t.token_hash,
                    expiresAt: new Date(t.expires_at),
                    usedAt: toDate(t.used_at),
                    replacedById: t.replaced_by_id,
                };
            }),
        });
    }
}
