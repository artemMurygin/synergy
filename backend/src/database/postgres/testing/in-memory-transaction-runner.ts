import { AsyncLocalStorage } from 'node:async_hooks';
import type { CommonQueryMethods } from 'slonik';
import { TransactionRunnerPort } from '../transaction-runner.port';

export class InMemoryTransactionRunner extends TransactionRunnerPort {
    private readonly storage = new AsyncLocalStorage<(() => void)[]>();

    commits = 0;

    async run<T>(work: () => Promise<T>): Promise<T> {
        if (this.storage.getStore() !== undefined) return work();
        const callbacks: (() => void)[] = [];
        const result = await this.storage.run(callbacks, work);
        this.commits += 1;
        for (const callback of callbacks) callback();
        return result;
    }

    executor(): CommonQueryMethods {
        throw new Error('InMemoryTransactionRunner has no database connection');
    }

    afterCommit(callback: () => void): void {
        const callbacks = this.storage.getStore();
        if (callbacks === undefined)
            throw new Error('afterCommit was called outside a transaction');
        callbacks.push(callback);
    }

    isInTransaction(): boolean {
        return this.storage.getStore() !== undefined;
    }
}
