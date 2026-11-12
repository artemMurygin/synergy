import type { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import {
    TranscriptSegmentRepositoryPort,
    type SpeakerTalkTime,
} from '../domain/ports/transcript-segment-repository.port';
import type { TranscriptSegment } from '../domain/transcript-segment';

export interface RecordedSegmentInsert {
    fileId: string;
    count: number;
    inTransaction: boolean;
}

/** Сегменты по `fileId`; запоминает, была ли запись внутри транзакции. */
export class InMemoryTranscriptSegmentRepository extends TranscriptSegmentRepositoryPort {
    readonly items = new Map<string, TranscriptSegment[]>();

    readonly inserts: RecordedSegmentInsert[] = [];

    constructor(private readonly transactions: TransactionRunnerPort | null = null) {
        super();
    }

    insertAll(fileId: string, segments: readonly TranscriptSegment[]): Promise<void> {
        if (segments.length === 0) return Promise.resolve();
        this.inserts.push({
            fileId,
            count: segments.length,
            inTransaction: this.transactions?.isInTransaction() ?? false,
        });
        const existing = this.items.get(fileId) ?? [];
        const taken = new Set(existing.map((s) => s.seq));
        if (segments.some((s) => taken.has(s.seq))) {
            return Promise.reject(new Error(`Duplicate segment seq for ${fileId}`));
        }
        this.items.set(fileId, [...existing, ...segments]);
        return Promise.resolve();
    }

    readAll(fileId: string): Promise<TranscriptSegment[]> {
        return Promise.resolve([...(this.items.get(fileId) ?? [])].sort((a, b) => a.seq - b.seq));
    }

    async speakerStats(fileId: string): Promise<SpeakerTalkTime[]> {
        const talk = new Map<number, number>();
        for (const s of await this.readAll(fileId)) {
            talk.set(s.speaker, (talk.get(s.speaker) ?? 0) + (s.endSec - s.startSec));
        }
        return [...talk.entries()]
            .sort(([a], [b]) => a - b)
            .map(([speaker, talkSec]) => ({ speaker, talkSec }));
    }

    async samples(fileId: string, perSpeaker: number): Promise<TranscriptSegment[]> {
        const all = await this.readAll(fileId);
        const total = Math.max(0, ...all.map((s) => s.endSec));
        const third = (s: TranscriptSegment): number =>
            total === 0 ? 0 : Math.min(2, Math.floor((3 * s.startSec) / total));
        const longerFirst = (a: TranscriptSegment, b: TranscriptSegment): number =>
            b.text.length - a.text.length || a.seq - b.seq;
        const picked: TranscriptSegment[] = [];
        for (const speaker of new Set(all.map((s) => s.speaker))) {
            const own = all.filter((s) => s.speaker === speaker);
            const rankInThird = new Map<TranscriptSegment, number>();
            for (const t of [0, 1, 2]) {
                own.filter((s) => third(s) === t)
                    .sort(longerFirst)
                    .forEach((s, i) => rankInThird.set(s, i));
            }
            own.sort(
                (a, b) =>
                    (rankInThird.get(a) ?? 0) - (rankInThird.get(b) ?? 0) || longerFirst(a, b),
            );
            picked.push(...own.slice(0, perSpeaker));
        }
        return picked.sort((a, b) => a.seq - b.seq);
    }
}
