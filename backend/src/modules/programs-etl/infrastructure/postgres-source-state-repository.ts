import { Inject, Injectable } from '@nestjs/common';
import { sql, type DatabasePool } from 'slonik';
import { z } from 'zod';
import { PG_POOL } from '../../../database/postgres/database.constants';
import { ProgramsSyncError } from '../application/errors/programs-sync.error';
import type { ChangedSource, SourceFingerprint } from '../application/models/source-fingerprint';
import type { SourceStateRepositoryPort } from '../application/ports/programs-etl.ports';

const rowSchema = z.object({
    spreadsheet_id: z.string(),
    sheet_id: z.string(),
    content_hash: z.string().nullable(),
});

interface SheetKey {
    readonly spreadsheetId: string;
    readonly sheetId: string;
}

/** sourceId has the form `${spreadsheetId}:${sheetId}`, see JsonGroupRegistry. */
function parseSourceId(sourceId: string): SheetKey {
    const separator = sourceId.lastIndexOf(':');
    const sheetId = sourceId.slice(separator + 1);
    if (separator < 1 || !/^\d+$/.test(sheetId)) {
        throw new ProgramsSyncError('INVALID_WORKFLOW_DATA', `Malformed source id: ${sourceId}`);
    }
    return { spreadsheetId: sourceId.slice(0, separator), sheetId };
}

/**
 * `source_sheet.content_hash` is the fingerprint of the last successfully processed
 * version of a sheet; the table stays hidden behind the port.
 */
@Injectable()
export class PostgresSourceStateRepository implements SourceStateRepositoryPort {
    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {}

    async findSuccessfulFingerprints(
        sourceIds: string[],
    ): Promise<Map<string, SourceFingerprint | null>> {
        const result = new Map<string, SourceFingerprint | null>();
        if (sourceIds.length === 0) return result;
        const keys = sourceIds.map(parseSourceId);

        const rows = await this.pool.any(sql.unsafe`
            SELECT s.spreadsheet_id, s.sheet_id::text AS sheet_id, s.content_hash
            FROM source_sheet s
            JOIN unnest(${sql.array(
                keys.map((k) => k.spreadsheetId),
                'text',
            )},
                        ${sql.array(
                            keys.map((k) => k.sheetId),
                            'int8',
                        )})
                 AS k(spreadsheet_id, sheet_id)
              ON s.spreadsheet_id = k.spreadsheet_id AND s.sheet_id = k.sheet_id
        `);
        const stored = new Map<string, string | null>();
        for (const raw of rows) {
            const row = rowSchema.parse(raw);
            stored.set(`${row.spreadsheet_id}:${row.sheet_id}`, row.content_hash);
        }
        for (const sourceId of sourceIds) {
            const hash = stored.get(sourceId);
            result.set(sourceId, hash === undefined || hash === null ? null : { value: hash });
        }
        return result;
    }

    async markSuccessfullyProcessed(input: {
        runId: string;
        fingerprints: ChangedSource[];
    }): Promise<void> {
        const entries = input.fingerprints.map((f) => ({
            key: parseSourceId(f.sourceId),
            hash: f.observedHash,
        }));
        if (entries.length === 0) return;

        // All-or-nothing. A source seen for the first time (no provenance staged yet,
        // e.g. an empty plan) gets its `source_sheet` row here; the title mirrors the
        // fallback used by the catalog writer when it stages provenance.
        await this.pool.transaction(async (tx) => {
            for (const { key, hash } of entries) {
                await tx.query(sql.unsafe`
                    INSERT INTO source_sheet (spreadsheet_id, sheet_id, title, content_hash, synced_at)
                    VALUES (${key.spreadsheetId}, ${key.sheetId}, ${`${key.spreadsheetId}:${key.sheetId}`}, ${hash}, now())
                    ON CONFLICT (spreadsheet_id, sheet_id)
                    DO UPDATE SET content_hash = EXCLUDED.content_hash,
                                  synced_at = now(),
                                  updated_at = now()
                `);
            }
        });
    }
}
