import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../../../database/postgres/transaction-runner.port';
import {
    TranscriptSegmentRepositoryPort,
    type SpeakerTalkTime,
} from '../../domain/ports/transcript-segment-repository.port';
import { TranscriptSegment } from '../../domain/transcript-segment';

const segmentRow = z.object({
    seq: z.number().int(),
    speaker: z.number().int(),
    start_sec: z.number(),
    end_sec: z.number(),
    text: z.string(),
});

const statRow = z.object({ speaker: z.number().int(), talk_sec: z.number() });

const COLUMNS = sql.fragment`seq, speaker, start_sec, end_sec, text`;

function toSegment(raw: unknown): TranscriptSegment {
    const row = segmentRow.parse(raw);
    return TranscriptSegment.of({
        seq: row.seq,
        speaker: row.speaker,
        startSec: row.start_sec,
        endSec: row.end_sec,
        text: row.text,
    });
}

@Injectable()
export class TranscriptSegmentRepository extends TranscriptSegmentRepositoryPort {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async insertAll(fileId: string, segments: readonly TranscriptSegment[]): Promise<void> {
        if (segments.length === 0) return;
        await this.transactions.executor().query(sql.unsafe`
            INSERT INTO meeting_transcript_segment (file_id, seq, speaker, start_sec, end_sec, text)
            SELECT ${fileId}, s.seq, s.speaker, s.start_sec, s.end_sec, s.text
            FROM ${sql.unnest(
                segments.map((s) => [s.seq, s.speaker, s.startSec, s.endSec, s.text]),
                ['int4', 'int2', 'float8', 'float8', 'text'],
            )} AS s (seq, speaker, start_sec, end_sec, text)`);
    }

    async readAll(fileId: string): Promise<TranscriptSegment[]> {
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT ${COLUMNS} FROM meeting_transcript_segment
            WHERE file_id = ${fileId}
            ORDER BY seq`);
        return rows.map(toSegment);
    }

    async speakerStats(fileId: string): Promise<SpeakerTalkTime[]> {
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT speaker::int AS speaker, sum(end_sec - start_sec)::float8 AS talk_sec
            FROM meeting_transcript_segment
            WHERE file_id = ${fileId}
            GROUP BY speaker
            ORDER BY speaker`);
        return rows.map((raw) => {
            const row = statRow.parse(raw);
            return { speaker: row.speaker, talkSec: row.talk_sec };
        });
    }

    async samples(fileId: string, perSpeaker: number): Promise<TranscriptSegment[]> {
        // Треть записи — по времени начала относительно конца последней реплики. Сначала
        // берётся лучшая реплика каждой трети, затем вторые по длине и так далее.
        const rows = await this.transactions.executor().any(sql.unsafe`
            WITH segment AS (
                SELECT ${COLUMNS} FROM meeting_transcript_segment WHERE file_id = ${fileId}
            ),
            total AS (SELECT max(end_sec) AS sec FROM segment),
            ranked AS (
                SELECT s.*,
                       row_number() OVER (
                           PARTITION BY s.speaker,
                               LEAST(2, floor(3 * s.start_sec / NULLIF(t.sec, 0)))
                           ORDER BY char_length(s.text) DESC, s.seq
                       ) AS rank_in_third
                FROM segment s CROSS JOIN total t
            ),
            picked AS (
                SELECT r.*,
                       row_number() OVER (
                           PARTITION BY r.speaker
                           ORDER BY r.rank_in_third, char_length(r.text) DESC, r.seq
                       ) AS pick
                FROM ranked r
            )
            SELECT ${COLUMNS} FROM picked
            WHERE pick <= ${perSpeaker}
            ORDER BY seq`);
        return rows.map(toSegment);
    }
}
