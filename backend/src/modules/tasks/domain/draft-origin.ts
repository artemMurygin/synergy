import { InvalidTaskBatchError } from './task-batch-errors';

/** Откуда пришёл список задач. При `meeting` после создания выпускается «Поставленные задачи». */
export interface DraftOrigin {
    readonly kind: 'meeting';
    readonly fileId: string;
    readonly recordingName: string;
}

export const DraftOrigin = {
    meeting(input: { fileId: string; recordingName: string }): DraftOrigin {
        const fileId = input.fileId.trim();
        const recordingName = input.recordingName.trim();
        if (fileId === '') throw new InvalidTaskBatchError('Meeting file id must not be empty');
        if (recordingName === '') {
            throw new InvalidTaskBatchError('Meeting recording name must not be empty');
        }
        return Object.freeze({ kind: 'meeting', fileId, recordingName });
    },

    /** Имя записи без расширения: для заголовка и имени файла документа. */
    recordingTitle(origin: DraftOrigin): string {
        const dot = origin.recordingName.lastIndexOf('.');
        return dot > 0 ? origin.recordingName.slice(0, dot) : origin.recordingName;
    },
};
