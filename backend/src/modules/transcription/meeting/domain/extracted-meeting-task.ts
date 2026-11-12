/**
 * Основание задачи: реплика расшифровки (`seq`), её время, подпись говорящего на момент
 * извлечения и цитата. Соответствие цитаты сегменту проверяет `EvidenceValidator`.
 */
export interface TaskEvidence {
    readonly seq: number;
    readonly startSec: number;
    readonly speakerLabel: string;
    readonly quote: string;
}

/** Задача из встречи после проверки основания. Без основания не существует. */
export interface ExtractedMeetingTask {
    readonly title: string;
    readonly description: string;
    /** Исполнитель так, как он прозвучал в речи (имя спикера или упоминание); `null` — не назван. */
    readonly assigneeMention: string | null;
    /** Срок, приведённый к дате относительно даты встречи; `null` — не назван или непонятен. */
    readonly due: Date | null;
    readonly evidence: TaskEvidence;
}

/** Ответ модели до проверки: может ссылаться на несуществующий сегмент или неточную цитату. */
export interface RawExtractedTask {
    readonly title: string;
    readonly description: string;
    readonly assigneeMention: string | null;
    readonly dueText: string | null;
    readonly evidence: { readonly seq: number; readonly quote: string } | null;
}
