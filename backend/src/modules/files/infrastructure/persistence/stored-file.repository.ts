import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { millisColumn, toTimestampOrNull } from '../../../../database/postgres/sql-time';
import { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { FileName } from '../../domain/file-name';
import { MediaType } from '../../domain/media-type';
import {
    StoredFileRepositoryPort,
    type StoredFileCursor,
} from '../../domain/ports/stored-file-repository.port';
import { Retention } from '../../domain/retention';
import type { RetentionPolicy } from '../../domain/retention-policy';
import { STORED_FILE_STATUSES, StoredFile } from '../../domain/stored-file';

const fileRow = z.object({
    id: z.string(),
    owner_id: z.string(),
    original_name: z.string(),
    media_type: z.string(),
    size_bytes: z.number(),
    storage_key: z.string(),
    status: z.enum(STORED_FILE_STATUSES),
    held_until: z.number().nullable(),
    expires_at: z.number().nullable(),
    uploaded_at: z.number(),
    deleted_at: z.number().nullable(),
    created_at: z.number(),
    updated_at: z.number(),
});

const COLUMNS = sql.fragment`
    id, owner_id, original_name, media_type, size_bytes::float8 AS size_bytes, storage_key, status,
    ${millisColumn('held_until')}, ${millisColumn('expires_at')}, ${millisColumn('uploaded_at')},
    ${millisColumn('deleted_at')}, ${millisColumn('created_at')}, ${millisColumn('updated_at')}`;

const toDate = (value: number | null): Date | null => (value === null ? null : new Date(value));

function toStoredFile(raw: unknown): StoredFile {
    const row = fileRow.parse(raw);
    return StoredFile.restore({
        id: row.id,
        ownerId: row.owner_id,
        name: FileName.of(row.original_name),
        mediaType: MediaType.of(row.media_type),
        sizeBytes: row.size_bytes,
        storageKey: row.storage_key,
        status: row.status,
        retention: Retention.of({
            heldUntil: toDate(row.held_until),
            expiresAt: toDate(row.expires_at),
        }),
        uploadedAt: new Date(row.uploaded_at),
        deletedAt: toDate(row.deleted_at),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    });
}

/** Сколько живёт зависшее удержание после `heldUntil` (по политике). */
function staleHoldGraceMs(policy: RetentionPolicy, now: Date): number {
    return policy.effectiveExpiry(Retention.heldUntil(now)).getTime() - now.getTime();
}

@Injectable()
export class StoredFileRepository extends StoredFileRepositoryPort {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async save(file: StoredFile): Promise<void> {
        const { heldUntil, expiresAt } = file.retention;
        // Владелец, имя, тип и ключ неизменны: при конфликте обновляется только состояние.
        await this.transactions.executor().query(sql.unsafe`
            INSERT INTO stored_file
                (id, owner_id, original_name, media_type, kind, size_bytes, storage_key, status,
                 held_until, expires_at, uploaded_at, deleted_at, created_at, updated_at)
            VALUES (${file.id}, ${file.ownerId}, ${file.name.value}, ${file.mediaType.mime},
                    ${file.kind}, ${file.sizeBytes}, ${file.storageKey}, ${file.status},
                    ${toTimestampOrNull(heldUntil)}, ${toTimestampOrNull(expiresAt)},
                    ${sql.timestamp(file.uploadedAt)}, ${toTimestampOrNull(file.deletedAt)},
                    ${sql.timestamp(file.createdAt)}, ${sql.timestamp(file.updatedAt)})
            ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status,
                held_until = EXCLUDED.held_until,
                expires_at = EXCLUDED.expires_at,
                deleted_at = EXCLUDED.deleted_at,
                updated_at = EXCLUDED.updated_at`);
    }

    async findById(id: string): Promise<StoredFile | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM stored_file WHERE id = ${id}`);
        return row === null ? null : toStoredFile(row);
    }

    async findByIdForUpdate(id: string): Promise<StoredFile | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM stored_file WHERE id = ${id} FOR UPDATE`);
        return row === null ? null : toStoredFile(row);
    }

    async findExpired(
        now: Date,
        policy: RetentionPolicy,
        limit: number,
        after: StoredFileCursor | null,
    ): Promise<StoredFile[]> {
        const staleHoldBefore = new Date(now.getTime() - staleHoldGraceMs(policy, now));
        const afterCursor =
            after === null
                ? sql.fragment`TRUE`
                : sql.fragment`(uploaded_at, id) > (${sql.timestamp(after.uploadedAt)}, ${after.id}::uuid)`;
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT ${COLUMNS} FROM stored_file
            WHERE status = 'active'
              AND (expires_at <= ${sql.timestamp(now)}
                   OR held_until <= ${sql.timestamp(staleHoldBefore)})
              AND ${afterCursor}
            ORDER BY uploaded_at ASC, id ASC
            LIMIT ${limit}`);
        return rows.map(toStoredFile);
    }
}
