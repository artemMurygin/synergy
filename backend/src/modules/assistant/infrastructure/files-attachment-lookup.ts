import { Injectable } from '@nestjs/common';
import { AttachmentRef } from '../../../shared/agent-capability';
import { FileNotFoundError } from '../../files/application/errors';
import { FindOwnedFilesUseCase } from '../../files/application/find-owned-files.use-case';
import { FileGoneError } from '../../files/domain/errors';
import {
    ChatAttachmentExpiredError,
    ChatAttachmentNotFoundError,
} from '../domain/chat-attachment.errors';
import { AttachmentFilesPort } from '../domain/ports/attachment-files.port';

/** Adapter over the `files` contract FindOwnedFiles: own active files become attachment refs. */
@Injectable()
export class FilesAttachmentLookup extends AttachmentFilesPort {
    constructor(private readonly findOwnedFiles: FindOwnedFilesUseCase) {
        super();
    }

    async findOwned(ownerId: string, fileIds: readonly string[]): Promise<AttachmentRef[]> {
        try {
            const views = await this.findOwnedFiles.execute({ ownerId, fileIds });
            return views.map((view) =>
                AttachmentRef.of({
                    fileId: view.id,
                    name: view.name,
                    mediaType: view.mediaType,
                    kind: view.kind,
                    sizeBytes: view.sizeBytes,
                }),
            );
        } catch (error) {
            if (error instanceof FileNotFoundError) {
                throw new ChatAttachmentNotFoundError(error.fileId);
            }
            if (error instanceof FileGoneError) throw new ChatAttachmentExpiredError(error.fileId);
            throw error;
        }
    }
}
