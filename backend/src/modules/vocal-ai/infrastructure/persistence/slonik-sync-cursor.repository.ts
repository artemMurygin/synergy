import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { SyncCursorRegressionError } from '../../domain/errors';
import { SyncCursorRepositoryPort } from '../../domain/ports/sync-cursor-repository.port';

const cursorRow = z.object({ last_synced_at: z.number().nullable() });

@Injectable()
export class SyncCursorRepository extends SyncCursorRepositoryPort {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async get(projectId: string): Promise<Date | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT last_synced_at FROM vocal_ai_projects WHERE project_id = ${projectId}`);
        if (row === null) return null;
        const parsed = cursorRow.parse(row);
        return parsed.last_synced_at === null ? null : new Date(parsed.last_synced_at);
    }

    /** Updates atomically only if `syncedAt` is not earlier than what is already stored. */
    async set(projectId: string, syncedAt: Date): Promise<void> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            INSERT INTO vocal_ai_projects (project_id, title, last_synced_at)
            VALUES (${projectId}, ${projectId}, ${syncedAt.toISOString()})
            ON CONFLICT (project_id) DO UPDATE SET last_synced_at = EXCLUDED.last_synced_at
            WHERE vocal_ai_projects.last_synced_at IS NULL
                OR EXCLUDED.last_synced_at >= vocal_ai_projects.last_synced_at
            RETURNING project_id`);
        if (row === null) {
            throw new SyncCursorRegressionError(
                `Sync cursor for project ${projectId} must not move to an earlier instant than the stored value`,
            );
        }
    }
}
