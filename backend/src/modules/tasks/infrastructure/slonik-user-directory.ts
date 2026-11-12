import { Inject, Injectable } from '@nestjs/common';
import { sql, type DatabasePool } from 'slonik';
import { z } from 'zod';
import { PG_POOL } from '../../../database/postgres/database.constants';
import { UserDirectory, type DirectoryUser } from '../domain/ports/user-directory.port';

const userRow = z.object({ id: z.string(), login: z.string() });

/** Reads active users straight from auth_users so that tasks does not depend on auth internals. */
@Injectable()
export class SlonikUserDirectory extends UserDirectory {
    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {
        super();
    }

    async findByIds(ids: readonly string[]): Promise<DirectoryUser[]> {
        if (ids.length === 0) return [];
        const rows = await this.pool.any(sql.unsafe`
            SELECT id, login FROM auth_users
            WHERE id = ANY(${sql.array([...new Set(ids)], 'uuid')})`);
        return rows.map((row) => userRow.parse(row));
    }

    async findActiveByIds(ids: readonly string[]): Promise<DirectoryUser[]> {
        if (ids.length === 0) return [];
        const rows = await this.pool.any(sql.unsafe`
            SELECT id, login FROM auth_users
            WHERE id = ANY(${sql.array([...new Set(ids)], 'uuid')}) AND is_active`);
        return rows.map((row) => userRow.parse(row));
    }

    async searchActive(query: string, limit: number): Promise<DirectoryUser[]> {
        const needle = query.trim();
        if (needle === '') return [];
        // LIKE wildcards of the query are escaped so that it is matched literally.
        const pattern = `%${needle.replace(/[\\%_]/g, '\\$&')}%`;
        const rows = await this.pool.any(sql.unsafe`
            SELECT id, login FROM auth_users
            WHERE is_active AND login ILIKE ${pattern}
            ORDER BY lower(login), id
            LIMIT ${limit}`);
        return rows.map((row) => userRow.parse(row));
    }
}
