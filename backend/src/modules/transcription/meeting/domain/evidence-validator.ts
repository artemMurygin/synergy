import type { RawExtractedTask } from './extracted-meeting-task';
import type { TranscriptSegment } from './transcript-segment';

const OUTER_PUNCTUATION = /^[\s"'«»„“”‘’.,;:!?…—–-]+|[\s"'«»„“”‘’.,;:!?…—–-]+$/gu;

/** Нижний регистр, «ё» → «е», пробелы схлопнуты, внешние кавычки и знаки препинания сняты. */
export function normalizeQuote(text: string): string {
    return text
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .replace(OUTER_PUNCTUATION, '')
        .trim();
}

/**
 * Защита от выдуманных задач: остаётся только задача с названием и основанием, у которого
 * `seq` есть в расшифровке, а нормализованная цитата входит в нормализованный текст сегмента.
 */
export const EvidenceValidator = {
    filter(
        tasks: readonly RawExtractedTask[],
        segments: ReadonlyMap<number, TranscriptSegment>,
    ): RawExtractedTask[] {
        return tasks.filter((task) => {
            if (task.title.trim().length === 0 || task.evidence === null) return false;
            const segment = segments.get(task.evidence.seq);
            if (segment === undefined) return false;
            const quote = normalizeQuote(task.evidence.quote);
            if (quote.length === 0) return false;
            return normalizeQuote(segment.text).includes(quote);
        });
    },
};
