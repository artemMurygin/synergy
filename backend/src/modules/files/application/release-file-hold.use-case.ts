import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { RetentionPolicy } from '../domain/retention-policy';
import { FilesClockPort } from '../domain/ports/clock.port';
import { StoredFileRepositoryPort } from '../domain/ports/stored-file-repository.port';

/** Идемпотентно; документ, удалённый и неизвестный файл не трогает. */
@Injectable()
export class ReleaseFileHoldUseCase {
    constructor(
        private readonly files: StoredFileRepositoryPort,
        private readonly policy: RetentionPolicy,
        private readonly clock: FilesClockPort,
        private readonly transactions: TransactionRunnerPort,
    ) {}

    async execute(fileId: string): Promise<void> {
        await this.transactions.run(async () => {
            const file = await this.files.findByIdForUpdate(fileId);
            if (file?.isAwaitingProcessing() !== true) return;
            file.releaseHold(this.clock.now(), this.policy);
            await this.files.save(file);
        });
    }
}
