import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { AdminLock } from '../domain/ports/admin-lock.port';

/** Fixed key of the global admin lock ("ADMN" in ASCII). */
const ADMIN_LOCK_KEY = 0x41444d4e;

/** Global lock on `pg_advisory_xact_lock`: held until the surrounding transaction ends. */
@Injectable()
export class PgAdminLock extends AdminLock {
    constructor(private readonly tx: TransactionRunnerPort) {
        super();
    }

    async acquire(): Promise<void> {
        await this.tx.executor().query(sql.unsafe`SELECT pg_advisory_xact_lock(${ADMIN_LOCK_KEY})`);
    }
}
