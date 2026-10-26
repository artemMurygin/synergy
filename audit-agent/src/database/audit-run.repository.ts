import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool, sql } from 'slonik';
import { z } from 'zod';
import { PG_POOL } from './database.constants';

const auditRunRow = z.object({
    id: z.string(),
    status: z.string(),
    input: z.unknown(),
    result: z.unknown().nullable(),
    created_at: z.number(),
    updated_at: z.number(),
});
export type AuditRun = z.infer<typeof auditRunRow>;

const columns = sql.fragment`id, status, input, result,
  (extract(epoch from created_at) * 1000)::float8 AS created_at,
  (extract(epoch from updated_at) * 1000)::float8 AS updated_at`;

@Injectable()
export class AuditRunRepository {
    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {}

    create(input: unknown) {
        return this.pool.one(sql.type(auditRunRow)`
      INSERT INTO audit_run (input) VALUES (${sql.jsonb(input as never)})
      RETURNING ${columns}`);
    }

    findById(id: string) {
        return this.pool.maybeOne(sql.type(auditRunRow)`
      SELECT ${columns} FROM audit_run WHERE id = ${id}`);
    }

    setStatus(id: string, status: string, result?: unknown) {
        return this.pool.one(sql.type(auditRunRow)`
      UPDATE audit_run
      SET status = ${status},
          result = COALESCE(${result === undefined ? null : sql.jsonb(result as never)}, result),
          updated_at = now()
      WHERE id = ${id}
      RETURNING ${columns}`);
    }
}
