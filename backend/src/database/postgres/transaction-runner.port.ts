import type { CommonQueryMethods } from 'slonik';

export abstract class TransactionRunnerPort {
    abstract run<T>(work: () => Promise<T>): Promise<T>;

    abstract savepoint<T>(work: () => Promise<T>): Promise<T>;

    abstract executor(): CommonQueryMethods;

    abstract afterCommit(callback: () => void): void;

    abstract isInTransaction(): boolean;
}
