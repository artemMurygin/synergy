import type { PreparedMeetingAudio } from './meeting-audio-preparer.port';

/**
 * Элемент ответа провайдера как есть: `type` (`word`, `spacing`, `audio_event`), время в секундах
 * от начала всей записи. Невалидные поля — `null`; отбор слов делает преобразователь.
 */
export interface WholeFileWord {
    readonly type: string | null;
    readonly text: string | null;
    readonly start: number | null;
    readonly end: number | null;
    readonly speakerId: string | null;
}

/** Ответ провайдера на всю запись. */
export interface WholeFileTranscription {
    readonly language: string | null;
    readonly words: readonly WholeFileWord[];
    /** Сколько секунд записи обработано; неизвестная стоимость — `null`, не 0. */
    readonly usage?: { readonly seconds: number; readonly cost: number | null };
}

/**
 * Распознавание речи с диаризацией для всей записи одним запросом. Бросает
 * `TranscriptionTemporaryError` или `TranscriptionPermanentError`; останавливается по `signal`.
 */
export abstract class WholeFileSttPort {
    abstract transcribe(
        audio: PreparedMeetingAudio,
        signal: AbortSignal,
    ): Promise<WholeFileTranscription>;
}
