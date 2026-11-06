import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import type { CommonQueryMethods, DatabasePool } from 'slonik';
import { PG_POOL } from '../../../database/postgres/database.constants';
import { TransactionRunner } from '../domain/ports/transaction-runner.port';

@Injectable()
export class SlonikTransactionRunner extends TransactionRunner {
    private readonly storage = new AsyncLocalStorage<CommonQueryMethods>();

    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {
        super();
    }

    run<T>(work: () => Promise<T>): Promise<T> {
        if (this.storage.getStore() !== undefined) return work();
        return this.pool.transaction((connection) => this.storage.run(connection, work));
    }

    /** The open transaction's connection, or the pool outside one. */
    executor(): CommonQueryMethods {
        return this.storage.getStore() ?? this.pool;
    }
}
