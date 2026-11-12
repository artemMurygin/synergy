import type { MeetingTranscript } from '../meeting-transcript';

export abstract class MeetingTranscriptRepositoryPort {
    /** Вставляет новую расшифровку; `false`, если для файла она уже есть (существующая не меняется). */
    abstract insertPendingIfAbsent(transcript: MeetingTranscript): Promise<boolean>;
    abstract findByFileId(fileId: string): Promise<MeetingTranscript | null>;
    /** Читает с блокировкой строки до конца транзакции; вызывается только внутри неё. */
    abstract findByFileIdForUpdate(fileId: string): Promise<MeetingTranscript | null>;
    /** Вставка или обновление изменяемых полей (статус, результат, попытки). */
    abstract save(transcript: MeetingTranscript): Promise<void>;
}
