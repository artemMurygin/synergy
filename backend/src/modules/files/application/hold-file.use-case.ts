import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { FileGoneError } from '../domain/errors';
import { RetentionPolicy } from '../domain/retention-policy';
import { FilesClockPort } from '../domain/ports/clock.port';
import { StoredFileRepositoryPort } from '../domain/ports/stored-file-repository.port';

/** Удержание записи для повтора обработки. Удалённый и неизвестный файл — FileGoneError. */
@Injectable()
export class HoldFileUseCase {
    constructor(
        private readonly files: StoredFileRepositoryPort,
        private readonly policy: RetentionPolicy,
        private readonly clock: FilesClockPort,
        private readonly transactions: TransactionRunnerPort,
    ) {}

    // Во внешней транзакции вызывающего блокировка держится до её коммита.
    async execute(fileId: string): Promise<void> {
        await this.transactions.run(async () => {
            const file = await this.files.findByIdForUpdate(fileId);
            if (file === null) throw new FileGoneError(fileId);
            file.hold(this.clock.now(), this.policy);
            await this.files.save(file);
        });
    }
}
