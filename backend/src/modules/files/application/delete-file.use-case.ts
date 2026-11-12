import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import { FilesClockPort } from '../domain/ports/clock.port';
import { ObjectStoragePort } from '../domain/ports/object-storage.port';
import { StoredFileRepositoryPort } from '../domain/ports/stored-file-repository.port';
import { assertOwned } from './find-owned-file';
import type { FileOfOwnerInput } from './get-file.use-case';

// Объект удаляется под блокировкой строки до её обновления: при сбое файл остаётся активным,
// и удаление можно повторить, а параллельный HoldFile/ReleaseFileHold не «воскресит» файл.
@Injectable()
export class DeleteFileUseCase {
    constructor(
        private readonly files: StoredFileRepositoryPort,
        private readonly storage: ObjectStoragePort,
        private readonly clock: FilesClockPort,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
    ) {}

    async execute({ ownerId, fileId }: FileOfOwnerInput): Promise<void> {
        await this.transactions.run(async () => {
            const file = assertOwned(await this.files.findByIdForUpdate(fileId), ownerId, fileId);
            if (file.isDeleted()) return;
            await this.storage.delete(file.storageKey);
            file.markDeleted(this.clock.now(), 'owner');
            await this.files.save(file);
            await this.events.publish(file.pullDomainEvents());
        });
    }
}
