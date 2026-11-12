import { formatTimecode } from '../domain/meeting-time-format';
import type { TranscriptionFailureReason } from '../domain/transcription-status';

/** Окончательный исход расшифровки, о котором пишется в чат. */
export type TranscriptOutcome =
    | { readonly kind: 'completed'; readonly speakerCount: number; readonly durationSec: number }
    | { readonly kind: 'no_speech'; readonly recordingName: string }
    | {
          readonly kind: 'failed';
          readonly reason: Exclude<TranscriptionFailureReason, 'file-deleted'>;
          readonly recordingName: string;
          /** Запись ещё хранится: повтор возможен. */
          readonly recordingStored: boolean;
          /** Допустимый максимум длительности записи, с. */
          readonly maxRecordingSec: number;
      };

/** Форма слова по числу: `[1, 2–4, 5+]`, с исключением 11–14. */
function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
    const mod100 = n % 100;
    const mod10 = n % 10;
    if (mod100 >= 11 && mod100 <= 14) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
}

/** «длиннее 4 часов», «длиннее 1 часа», «длиннее 90 минут»: родительный падеж. */
function longerThan(maxSec: number): string {
    const genitive = (n: number, one: string, other: string): string =>
        n % 10 === 1 && n % 100 !== 11 ? one : other;
    if (maxSec % 3600 === 0) {
        const hours = maxSec / 3600;
        return `${String(hours)} ${genitive(hours, 'часа', 'часов')}`;
    }
    const minutes = Math.max(1, Math.round(maxSec / 60));
    return `${String(minutes)} ${genitive(minutes, 'минуты', 'минут')}`;
}

const RETRY_OFFER = 'Напишите «попробуй ещё раз», и я повторю.';
const UPLOAD_AGAIN = 'Запись уже удалена, загрузите её заново.';

/** Фиксированные тексты сообщений о расшифровке (ui-design.md, «Тексты сообщений системы»). */
export function transcriptFinishedText(outcome: TranscriptOutcome): string {
    switch (outcome.kind) {
        case 'completed': {
            const count = outcome.speakerCount;
            const speakers = `${String(count)} ${plural(count, ['спикер', 'спикера', 'спикеров'])}`;
            return `Расшифровка готова: ${speakers}, ${formatTimecode(outcome.durationSec)}. Напишите, кто есть кто, например: «Спикер 1 — Анна, Спикер 2 — Олег». Можно сразу перейти к задачам: напишите «извлеки задачи».`;
        }
        case 'no_speech':
            return `В записи ${outcome.recordingName} не удалось найти речь. Проверьте, что это нужный файл, и загрузите его снова.`;
        case 'failed':
            return failedText(outcome);
    }
}

function failedText(outcome: Extract<TranscriptOutcome, { kind: 'failed' }>): string {
    const name = outcome.recordingName;
    const next = outcome.recordingStored ? RETRY_OFFER : UPLOAD_AGAIN;
    switch (outcome.reason) {
        case 'provider-unavailable':
            return `Не удалось расшифровать ${name}: сервис распознавания сейчас недоступен. ${next}`;
        case 'timeout':
            return `Не удалось расшифровать ${name}: обработка заняла слишком много времени. ${next}`;
        case 'too-long':
            return `Запись ${name} длиннее ${longerThan(outcome.maxRecordingSec)}, такие пока не поддерживаются. Разделите её на части и загрузите по очереди.`;
        case 'unsupported-media':
            return `Не удалось прочитать запись ${name}. Загрузите другой файл, например mp3 или m4a.`;
    }
}
