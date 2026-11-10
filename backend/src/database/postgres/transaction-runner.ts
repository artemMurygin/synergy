import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { CommonQueryMethods, DatabasePool } from 'slonik';
import { PG_POOL } from './database.constants';
import { TransactionRunnerPort } from './transaction-runner.port';

interface TransactionScope {
    readonly connection: CommonQueryMethods;
    readonly afterCommitCallbacks: (() => void)[];
}

export class AfterCommitOutsideTransactionError extends Error {
    constructor() {
        super('afterCommit was called outside a transaction');
        this.name = 'AfterCommitOutsideTransactionError';
    }
}

@Injectable()
export class TransactionRunner extends TransactionRunnerPort {
    private readonly storage = new AsyncLocalStorage<TransactionScope>();

    constructor(
        @Inject(PG_POOL) private readonly pool: DatabasePool,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(TransactionRunner.name);
    }

    async run<T>(work: () => Promise<T>): Promise<T> {
        if (this.storage.getStore() !== undefined) return work();
        const afterCommitCallbacks: (() => void)[] = [];
        const result = await this.pool.transaction((connection) =>
            this.storage.run({ connection, afterCommitCallbacks }, work),
        );
        this.runAfterCommitCallbacks(afterCommitCallbacks);
        return result;
    }

    executor(): CommonQueryMethods {
        return this.storage.getStore()?.connection ?? this.pool;
    }

    afterCommit(callback: () => void): void {
        const scope = this.storage.getStore();
        if (scope === undefined) throw new AfterCommitOutsideTransactionError();
        scope.afterCommitCallbacks.push(callback);
    }

    isInTransaction(): boolean {
        return this.storage.getStore() !== undefined;
    }

    private runAfterCommitCallbacks(callbacks: readonly (() => void)[]): void {
        for (const callback of callbacks) {
            try {
                callback();
            } catch (error: unknown) {
                this.logger.error({ err: error }, 'After-commit callback failed');
            }
        }
    }
}
