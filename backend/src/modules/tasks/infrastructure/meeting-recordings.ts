import { Injectable } from '@nestjs/common';
import { FileNotFoundError } from '../../files/application/errors';
import { GetFileUseCase } from '../../files/application/get-file.use-case';
import { MeetingRecordingsPort } from '../domain/ports/meeting-recordings.port';

@Injectable()
export class MeetingRecordings extends MeetingRecordingsPort {
    constructor(private readonly getFile: GetFileUseCase) {
        super();
    }

    async findOwnedRecordingName(ownerId: string, fileId: string): Promise<string | null> {
        try {
            const file = await this.getFile.execute({ ownerId, fileId });
            return file.kind === 'recording' ? file.name : null;
        } catch (error: unknown) {
            if (error instanceof FileNotFoundError) return null;
            throw error;
        }
    }
}
