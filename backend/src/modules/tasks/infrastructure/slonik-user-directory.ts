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

    async findActiveByIds(ids: readonly string[]): Promise<DirectoryUser[]> {
        if (ids.length === 0) return [];
        const rows = await this.pool.any(sql.unsafe`
            SELECT id, login FROM auth_users
            WHERE id = ANY(${sql.array([...new Set(ids)], 'uuid')}) AND is_active`);
        return rows.map((row) => userRow.parse(row));
    }
}
