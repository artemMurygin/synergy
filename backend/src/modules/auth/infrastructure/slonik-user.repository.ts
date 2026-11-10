import { Inject, Injectable } from '@nestjs/common';
import { sql, type DatabasePool } from 'slonik';
import { z } from 'zod';
import { PG_POOL } from '../../../database/postgres/database.constants';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { UserRepository } from '../domain/ports/user-repository.port';
import { User } from '../domain/user';
import type { UserSearch } from '../domain/user-search';
import type { UserSummary } from '../domain/user-summary';
import { SlonikTransactionRunner } from './slonik-transaction-runner';

const userRow = z.object({
    id: z.string(),
    login: z.string(),
    password_hash: z.string(),
    must_change_password: z.boolean(),
    is_active: z.boolean(),
    created_at: z.number(),
    password_changed_at: z.number().nullable(),
});

const summaryRow = z.object({ id: z.string(), login: z.string() });

const COLUMNS = sql.fragment`
    id, login, password_hash, must_change_password, is_active,
    (extract(epoch FROM created_at) * 1000)::float8 AS created_at,
    (extract(epoch FROM password_changed_at) * 1000)::float8 AS password_changed_at`;

function toUser(raw: unknown): User {
    const row = userRow.parse(raw);
    const createdAt = new Date(row.created_at);
    return User.restore({
        id: row.id,
        login: Login.of(row.login),
        passwordHash: PasswordHash.of(row.password_hash),
        mustChangePassword: row.must_change_password,
        isActive: row.is_active,
        createdAt,
        passwordChangedAt:
            row.password_changed_at === null ? createdAt : new Date(row.password_changed_at),
    });
}

@Injectable()
export class SlonikUserRepository extends UserRepository {
    constructor(
        @Inject(PG_POOL) _pool: DatabasePool,
        private readonly tx: SlonikTransactionRunner,
    ) {
        super();
    }

    async findByLogin(login: Login): Promise<User | null> {
        const row = await this.tx.executor().maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM auth_users WHERE lower(login) = ${login.value}`);
        return row === null ? null : toUser(row);
    }

    async findById(id: string): Promise<User | null> {
        const row = await this.tx.executor().maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM auth_users WHERE id = ${id}`);
        return row === null ? null : toUser(row);
    }

    async save(user: User): Promise<void> {
        await this.tx.executor().query(sql.unsafe`
            INSERT INTO auth_users
                (id, login, password_hash, must_change_password, is_active, created_at, password_changed_at)
            VALUES (${user.id}, ${user.login.value}, ${user.passwordHash.value},
                    ${user.mustChangePassword}, ${user.isActive},
                    ${sql.timestamp(user.createdAt)}, ${sql.timestamp(user.passwordChangedAt)})
            ON CONFLICT (id) DO UPDATE SET
                login = EXCLUDED.login,
                password_hash = EXCLUDED.password_hash,
                must_change_password = EXCLUDED.must_change_password,
                is_active = EXCLUDED.is_active,
                password_changed_at = EXCLUDED.password_changed_at`);
    }

    async existsByLogin(login: Login): Promise<boolean> {
        return this.tx.executor().exists(sql.unsafe`
            SELECT 1 FROM auth_users WHERE lower(login) = ${login.value}`);
    }

    async searchActive(
        search: UserSearch,
        limit: number,
        offset: number,
    ): Promise<{ items: UserSummary[]; total: number }> {
        const pattern = search.likePattern;
        const where =
            pattern === null
                ? sql.fragment`is_active`
                : sql.fragment`is_active AND login ILIKE ${pattern} ESCAPE '\\'`;
        const executor = this.tx.executor();
        const rows = await executor.any(sql.unsafe`
            SELECT id, login FROM auth_users WHERE ${where}
            ORDER BY lower(login), id LIMIT ${limit} OFFSET ${offset}`);
        const count = await executor.oneFirst(sql.unsafe`
            SELECT count(*)::int FROM auth_users WHERE ${where}`);
        return {
            items: rows.map((row) => summaryRow.parse(row)),
            total: z.number().parse(count),
        };
    }
}
