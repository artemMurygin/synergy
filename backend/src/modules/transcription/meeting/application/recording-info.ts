import type { GetFileUseCase } from '../../../files/application/get-file.use-case';
import { FileNotFoundError } from '../../../files/application/errors';
import type { MeetingTranscript } from '../domain/meeting-transcript';

export interface RecordingInfo {
    /** Исходное имя файла записи. */
    readonly name: string;
    /** Дата загрузки записи: дата встречи для документов и сроков. */
    readonly uploadedAt: Date;
}

const FALLBACK_RECORDING_NAME = 'Запись встречи';

/**
 * Имя и дата загрузки записи. Метаданные файла остаются и после удаления записи; если их
 * всё же нет, берётся время создания расшифровки (она создаётся при загрузке).
 */
export async function describeRecording(
    getFile: GetFileUseCase,
    transcript: MeetingTranscript,
): Promise<RecordingInfo> {
    try {
        const file = await getFile.execute({
            ownerId: transcript.ownerId,
            fileId: transcript.fileId,
        });
        return { name: file.name, uploadedAt: file.uploadedAt };
    } catch (error: unknown) {
        if (!(error instanceof FileNotFoundError)) throw error;
        return { name: FALLBACK_RECORDING_NAME, uploadedAt: transcript.createdAt };
    }
}
