import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool, sql } from 'slonik';
import { z } from 'zod';
import { AUDIT_STATUS, type AuditRun, type AuditStatus } from '../../domain/audit/audit-run';
import { AuditRunRepository } from '../../domain/audit/audit-run.repository';
import { PG_POOL } from '../../../../database/postgres/database.constants';

const auditRunRow = z.object({
    id: z.string(),
    status: z.enum([
        AUDIT_STATUS.PENDING,
        AUDIT_STATUS.RUNNING,
        AUDIT_STATUS.DONE,
        AUDIT_STATUS.FAILED,
    ]),
    input: z.unknown(),
    result: z.unknown().nullable(),
    created_at: z.number(),
    updated_at: z.number(),
});

const columns = sql.fragment`id, status, input, result,
  (extract(epoch from created_at) * 1000)::float8 AS created_at,
  (extract(epoch from updated_at) * 1000)::float8 AS updated_at`;

@Injectable()
export class PostgresAuditRunRepository extends AuditRunRepository {
    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {
        super();
    }

    create(input: unknown): Promise<AuditRun> {
        return this.pool.one(sql.type(auditRunRow)`
      INSERT INTO audit_run (input) VALUES (${sql.jsonb(input as never)})
      RETURNING ${columns}`);
    }

    findById(id: string): Promise<AuditRun | null> {
        return this.pool.maybeOne(sql.type(auditRunRow)`
      SELECT ${columns} FROM audit_run WHERE id = ${id}`);
    }

    setStatus(id: string, status: AuditStatus, result?: unknown): Promise<AuditRun> {
        return this.pool.one(sql.type(auditRunRow)`
      UPDATE audit_run
      SET status = ${status},
          result = COALESCE(${result === undefined ? null : sql.jsonb(result as never)}, result),
          updated_at = now()
      WHERE id = ${id}
      RETURNING ${columns}`);
    }
}
