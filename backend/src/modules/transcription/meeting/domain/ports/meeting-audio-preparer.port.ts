/** Целый аудиофайл записи, готовый к отправке в STT: один OGG без нарезки. */
export interface PreparedMeetingAudio {
    readonly path: string;
    readonly durationSec: number;
    readonly sizeBytes: number;
}

/**
 * Подготовка целой записи для распознавания: аудиодорожка в один сжатый файл.
 * Длительность и размер проверяются до обращения к провайдеру. Бросает
 * `TranscriptionPermanentError` (`unsupported-media`, `too-long`); при ошибке или отмене
 * временный файл удаляется.
 */
export abstract class MeetingAudioPreparerPort {
    abstract prepare(
        inputPath: string,
        workDir: string,
        signal: AbortSignal,
    ): Promise<PreparedMeetingAudio>;
}
