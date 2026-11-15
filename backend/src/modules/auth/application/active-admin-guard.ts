import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { LastAdminError } from '../domain/errors';
import { AdminLock } from '../domain/ports/admin-lock.port';
import { UserRepository } from '../domain/ports/user-repository.port';

/**
 * Keeps the invariant "at least one active admin" for operations that can reduce their number.
 * Takes the global admin lock, applies the change and checks the result in one transaction;
 * a violation throws and rolls the change back.
 */
@Injectable()
export class ActiveAdminGuard {
    constructor(
        private readonly users: UserRepository,
        private readonly lock: AdminLock,
        private readonly tx: TransactionRunnerPort,
    ) {}

    async run<T>(change: () => Promise<T>): Promise<T> {
        return this.tx.run(async () => {
            await this.lock.acquire();
            const result = await change();
            if ((await this.users.countActiveAdmins()) === 0) throw new LastAdminError();
            return result;
        });
    }
}
