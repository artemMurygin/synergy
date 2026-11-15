import type { CommonQueryMethods } from 'slonik';

export abstract class TransactionRunnerPort {
    abstract run<T>(work: () => Promise<T>): Promise<T>;

    /**
     * Выполняет work во вложенной транзакции (SAVEPOINT): при ошибке откатывается только она,
     * внешняя транзакция остаётся рабочей. Вне транзакции равна `run`.
     */
    savepoint<T>(work: () => Promise<T>): Promise<T> {
        return this.run(work);
    }

    abstract executor(): CommonQueryMethods;

    abstract afterCommit(callback: () => void): void;

    abstract isInTransaction(): boolean;
}
