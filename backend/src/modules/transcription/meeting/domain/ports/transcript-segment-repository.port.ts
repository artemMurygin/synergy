import type { TranscriptSegment } from '../transcript-segment';

export interface SpeakerTalkTime {
    readonly speaker: number;
    readonly talkSec: number;
}

/**
 * Сегменты расшифровки вне агрегата `MeetingTranscript`: пишутся один раз вместе с `complete`
 * и дальше только читаются (целиком, статистикой, выборкой примеров).
 */
export abstract class TranscriptSegmentRepositoryPort {
    /** Пачкой; вызывается в транзакции `complete`. */
    abstract insertAll(fileId: string, segments: readonly TranscriptSegment[]): Promise<void>;
    /** По возрастанию `seq`. */
    abstract readAll(fileId: string): Promise<TranscriptSegment[]>;
    /** Суммарное время речи каждого собеседника, по возрастанию номера. */
    abstract speakerStats(fileId: string): Promise<SpeakerTalkTime[]>;
    /**
     * До `perSpeaker` самых длинных реплик каждого собеседника, сначала по одной из разных
     * третей записи; результат по возрастанию `seq`.
     */
    abstract samples(fileId: string, perSpeaker: number): Promise<TranscriptSegment[]>;
}
