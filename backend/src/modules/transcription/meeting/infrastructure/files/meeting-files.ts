import { Injectable } from '@nestjs/common';
import { FileNotFoundError } from '../../../../files/application/errors';
import { GetFileUseCase } from '../../../../files/application/get-file.use-case';
import { StoreGeneratedFileUseCase } from '../../../../files/application/store-generated-file.use-case';
import {
    MeetingFilesPort,
    type MeetingDocumentFile,
    type MeetingDocumentInput,
    type MeetingFile,
} from '../../domain/ports/meeting-files.port';

@Injectable()
export class MeetingFiles extends MeetingFilesPort {
    constructor(
        private readonly getFile: GetFileUseCase,
        private readonly storeGeneratedFile: StoreGeneratedFileUseCase,
    ) {
        super();
    }

    async findFile(ownerId: string, fileId: string): Promise<MeetingFile | null> {
        try {
            const file = await this.getFile.execute({ ownerId, fileId });
            return {
                name: file.name,
                uploadedAt: file.uploadedAt,
                isRecording: file.kind === 'recording',
                isStored: file.status === 'active',
            };
        } catch (error: unknown) {
            if (error instanceof FileNotFoundError) return null;
            throw error;
        }
    }

    async storeDocument(input: MeetingDocumentInput): Promise<MeetingDocumentFile> {
        const file = await this.storeGeneratedFile.execute(input);
        return {
            id: file.id,
            name: file.name,
            mediaType: file.mediaType,
            sizeBytes: file.sizeBytes,
        };
    }
}
