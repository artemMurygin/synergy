import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { millisColumn, toTimestampOrNull } from '../../../../../database/postgres/sql-time';
import { TransactionRunnerPort } from '../../../../../database/postgres/transaction-runner.port';
import { MeetingTranscript } from '../../domain/meeting-transcript';
import { MeetingTranscriptRepositoryPort } from '../../domain/ports/meeting-transcript-repository.port';
import { SpeakerNames } from '../../domain/speaker-names';
import {
    TRANSCRIPTION_FAILURE_REASONS,
    TRANSCRIPTION_STATUSES,
} from '../../domain/transcription-status';

const speakerJson = z.object({ speaker: z.number().int(), name: z.string() });

const transcriptRow = z.object({
    file_id: z.string(),
    owner_id: z.string(),
    status: z.enum(TRANSCRIPTION_STATUSES),
    failure_reason: z.enum(TRANSCRIPTION_FAILURE_REASONS).nullable(),
    language: z.string().nullable(),
    duration_sec: z.number().nullable(),
    speaker_count: z.number().int(),
    speakers: z.array(speakerJson),
    attempts: z.number().int(),
    created_at: z.number(),
    updated_at: z.number(),
    completed_at: z.number().nullable(),
});

// Имена собеседников — подзапросом: строки есть только у собеседников с именем.
const COLUMNS = sql.fragment`
    t.file_id, t.owner_id, t.status, t.failure_reason, t.language, t.duration_sec,
    t.speaker_count, t.attempts,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('speaker', s.speaker, 'name', s.name)
                               ORDER BY s.speaker), '[]'::jsonb)
     FROM meeting_transcript_speaker s WHERE s.file_id = t.file_id) AS speakers,
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
        speakerCount: row.speaker_count,
        speakerNames: SpeakerNames.of(row.speakers.map((s) => [s.speaker, s.name] as const)),
        attempts: row.attempts,
        completedAt: row.completed_at === null ? null : new Date(row.completed_at),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    });
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
            SELECT ${COLUMNS} FROM meeting_transcript t WHERE t.file_id = ${fileId}`);
        return row === null ? null : toMeetingTranscript(row);
    }

    async findByFileIdForUpdate(fileId: string): Promise<MeetingTranscript | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM meeting_transcript t WHERE t.file_id = ${fileId}
            FOR UPDATE OF t`);
        return row === null ? null : toMeetingTranscript(row);
    }

    async save(transcript: MeetingTranscript): Promise<void> {
        await this.transactions.run(async () => {
            await this.saveTranscript(transcript);
            await this.saveSpeakerNames(transcript);
        });
    }

    private async saveTranscript(transcript: MeetingTranscript): Promise<void> {
        // Владелец и время создания неизменны: при конфликте обновляется только состояние.
        await this.transactions.executor().query(sql.unsafe`
            INSERT INTO meeting_transcript
                (file_id, owner_id, status, failure_reason, language, duration_sec, speaker_count,
                 attempts, created_at, updated_at, completed_at)
            VALUES (${transcript.fileId}, ${transcript.ownerId}, ${transcript.status},
                    ${transcript.failureReason}, ${transcript.language}, ${transcript.durationSec},
                    ${transcript.speakerCount}, ${transcript.attempts},
                    ${sql.timestamp(transcript.createdAt)}, ${sql.timestamp(transcript.updatedAt)},
                    ${toTimestampOrNull(transcript.completedAt)})
            ON CONFLICT (file_id) DO UPDATE SET
                status = EXCLUDED.status,
                failure_reason = EXCLUDED.failure_reason,
                language = EXCLUDED.language,
                duration_sec = EXCLUDED.duration_sec,
                speaker_count = EXCLUDED.speaker_count,
                attempts = EXCLUDED.attempts,
                updated_at = EXCLUDED.updated_at,
                completed_at = EXCLUDED.completed_at`);
    }

    /** Сброшенное имя — удалённая строка; неизменные имена не переписываются. */
    private async saveSpeakerNames(transcript: MeetingTranscript): Promise<void> {
        const entries = transcript.speakerNames.entries();
        const executor = this.transactions.executor();
        await executor.query(sql.unsafe`
            DELETE FROM meeting_transcript_speaker
            WHERE file_id = ${transcript.fileId}
              AND NOT (speaker = ANY(${sql.array(
                  entries.map((e) => e.speaker),
                  'int4',
              )}))`);
        if (entries.length === 0) return;
        await executor.query(sql.unsafe`
            INSERT INTO meeting_transcript_speaker (file_id, speaker, name, updated_at)
            SELECT ${transcript.fileId}, e.speaker, e.name, ${sql.timestamp(transcript.updatedAt)}
            FROM ${sql.unnest(
                entries.map((e) => [e.speaker, e.name]),
                ['int2', 'text'],
            )} AS e (speaker, name)
            ON CONFLICT (file_id, speaker) DO UPDATE SET
                name = EXCLUDED.name,
                updated_at = EXCLUDED.updated_at
            WHERE meeting_transcript_speaker.name IS DISTINCT FROM EXCLUDED.name`);
    }
}
