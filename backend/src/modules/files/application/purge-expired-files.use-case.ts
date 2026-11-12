import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import { RetentionPolicy } from '../domain/retention-policy';
import { ObjectStoragePort } from '../domain/ports/object-storage.port';
import {
    StoredFileRepositoryPort,
    type StoredFileCursor,
} from '../domain/ports/stored-file-repository.port';

export const PURGE_BATCH_SIZE = 100;

export interface PurgeExpiredFilesResult {
    deleted: number;
    failed: number;
}

type PurgeOutcome = 'deleted' | 'skipped' | 'failed';

/** Ошибка по одному файлу не останавливает остальные; такой файл останется до следующего запуска. */
@Injectable()
export class PurgeExpiredFilesUseCase {
    constructor(
        private readonly files: StoredFileRepositoryPort,
        private readonly storage: ObjectStoragePort,
        private readonly policy: RetentionPolicy,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(PurgeExpiredFilesUseCase.name);
    }

    async execute(now: Date): Promise<PurgeExpiredFilesResult> {
        const result: PurgeExpiredFilesResult = { deleted: 0, failed: 0 };
        let after: StoredFileCursor | null = null;
        for (;;) {
            const batch = await this.files.findExpired(now, this.policy, PURGE_BATCH_SIZE, after);
            for (const candidate of batch) {
                const outcome = await this.purge(candidate.id, now);
                if (outcome === 'deleted') result.deleted += 1;
                if (outcome === 'failed') result.failed += 1;
            }
            const last = batch.at(-1);
            if (last === undefined || batch.length < PURGE_BATCH_SIZE) break;
            after = { uploadedAt: last.uploadedAt, id: last.id };
        }
        return result;
    }

    // Строка перечитывается под блокировкой: с момента выборки владелец мог удалить файл
    // или повторить обработку и снова поставить удержание.
    private async purge(fileId: string, now: Date): Promise<PurgeOutcome> {
        try {
            return await this.transactions.run(async (): Promise<PurgeOutcome> => {
                const file = await this.files.findByIdForUpdate(fileId);
                if (file?.isExpired(now, this.policy) !== true) return 'skipped';
                await this.storage.delete(file.storageKey);
                file.markDeleted(now, 'retention');
                await this.files.save(file);
                await this.events.publish(file.pullDomainEvents());
                return 'deleted';
            });
        } catch (error: unknown) {
            this.logger.warn({ fileId, err: error }, 'Expired file purge failed');
            return 'failed';
        }
    }
}
