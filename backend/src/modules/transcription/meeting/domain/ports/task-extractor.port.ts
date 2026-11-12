import type { RawExtractedTask } from '../extracted-meeting-task';

export interface TaskExtractionContext {
    /** Подписи участников (имена или «Спикер N»), без повторов. */
    readonly participants: readonly string[];
    /** Дата встречи (загрузки записи): от неё модель понимает относительные сроки. */
    readonly meetingDate: Date;
}

/**
 * Извлечение задач моделью. На входе реплики `[seq] [чч:мм:сс] Имя: текст`; ответ ещё не
 * проверен — основание сверяет `EvidenceValidator`.
 */
export abstract class TaskExtractorPort {
    abstract extract(
        lines: readonly string[],
        context: TaskExtractionContext,
    ): Promise<RawExtractedTask[]>;
    /** Слияние результатов окон: дубли убираются, формулировки объединяются. */
    abstract merge(batches: readonly (readonly RawExtractedTask[])[]): Promise<RawExtractedTask[]>;
}
