import { Injectable } from '@nestjs/common';
import { sql, type ValueExpression } from 'slonik';
import { z } from 'zod';
import { millisColumn, toTimestampOrNull } from '../../../../../database/postgres/sql-time';
import { TransactionRunnerPort } from '../../../../../database/postgres/transaction-runner.port';
import { MeetingTranscript } from '../../domain/meeting-transcript';
import { MeetingTranscriptRepositoryPort } from '../../domain/ports/meeting-transcript-repository.port';
import { TranscriptSegment } from '../../domain/transcript-segment';
import {
    TRANSCRIPTION_FAILURE_REASONS,
    TRANSCRIPTION_STATUSES,
} from '../../domain/transcription-status';

const segmentJson = z.object({
    speaker: z.string(),
    start: z.number(),
    end: z.number(),
    text: z.string(),
});

const transcriptRow = z.object({
    file_id: z.string(),
    owner_id: z.string(),
    status: z.enum(TRANSCRIPTION_STATUSES),
    failure_reason: z.enum(TRANSCRIPTION_FAILURE_REASONS).nullable(),
    language: z.string().nullable(),
    duration_sec: z.number().nullable(),
    segments: z.array(segmentJson),
    attempts: z.number().int(),
    created_at: z.number(),
    updated_at: z.number(),
    completed_at: z.number().nullable(),
});

const COLUMNS = sql.fragment`
    file_id, owner_id, status, failure_reason, language, duration_sec, segments, attempts,
    ${millisColumn('created_at')}, ${millisColumn('updated_at')}, ${millisColumn('completed_at')}`;

function toMeetingTranscript(raw: unknown): MeetingTranscript {
    const row = transcriptRow.parse(raw);
    return MeetingTranscript.restore({
        fileId: row.file_id,
        ownerId: row.owner_id,
        status: row.status,
        failureReason: row.failure_reason,
        language: row.language,
        durationSec: row.duration_sec,
        segments: row.segments.map((s) => TranscriptSegment.of(s)),
        attempts: row.attempts,
        completedAt: row.completed_at === null ? null : new Date(row.completed_at),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    });
}

function segmentsJson(transcript: MeetingTranscript): ValueExpression {
    return sql.jsonb(
        transcript.segments.map(({ speaker, start, end, text }) => ({ speaker, start, end, text })),
    );
}

@Injectable()
export class MeetingTranscriptRepository extends MeetingTranscriptRepositoryPort {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async insertPendingIfAbsent(transcript: MeetingTranscript): Promise<boolean> {
        const inserted = await this.transactions.executor().maybeOne(sql.unsafe`
            INSERT INTO meeting_transcript
                (file_id, owner_id, status, attempts, created_at, updated_at)
            VALUES (${transcript.fileId}, ${transcript.ownerId}, ${transcript.status},
                    ${transcript.attempts}, ${sql.timestamp(transcript.createdAt)},
                    ${sql.timestamp(transcript.updatedAt)})
            ON CONFLICT (file_id) DO NOTHING
            RETURNING file_id`);
        return inserted !== null;
    }

    async findByFileId(fileId: string): Promise<MeetingTranscript | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM meeting_transcript WHERE file_id = ${fileId}`);
        return row === null ? null : toMeetingTranscript(row);
    }

    async findByFileIdForUpdate(fileId: string): Promise<MeetingTranscript | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM meeting_transcript WHERE file_id = ${fileId} FOR UPDATE`);
        return row === null ? null : toMeetingTranscript(row);
    }

    async save(transcript: MeetingTranscript): Promise<void> {
        // Владелец и время создания неизменны: при конфликте обновляется только состояние.
        await this.transactions.executor().query(sql.unsafe`
            INSERT INTO meeting_transcript
                (file_id, owner_id, status, failure_reason, language, duration_sec, speaker_count,
                 segments, attempts, created_at, updated_at, completed_at)
            VALUES (${transcript.fileId}, ${transcript.ownerId}, ${transcript.status},
                    ${transcript.failureReason}, ${transcript.language}, ${transcript.durationSec},
                    ${transcript.speakerCount}, ${segmentsJson(transcript)}, ${transcript.attempts},
                    ${sql.timestamp(transcript.createdAt)}, ${sql.timestamp(transcript.updatedAt)},
                    ${toTimestampOrNull(transcript.completedAt)})
            ON CONFLICT (file_id) DO UPDATE SET
                status = EXCLUDED.status,
                failure_reason = EXCLUDED.failure_reason,
                language = EXCLUDED.language,
                duration_sec = EXCLUDED.duration_sec,
                speaker_count = EXCLUDED.speaker_count,
                segments = EXCLUDED.segments,
                attempts = EXCLUDED.attempts,
                updated_at = EXCLUDED.updated_at,
                completed_at = EXCLUDED.completed_at`);
    }
}
