import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { CallTranscriptRepositoryPort } from '../../domain/ports/call-transcript-repository.port';
import { CallTranscript } from '../../domain/entities/call-transcript.entity';
import { CallTranscriptLine } from '../../domain/entities/call-transcript-line.entity';
import { CallId } from '../../domain/value-objects/call-id.value-object';

const LINE_COLUMN_TYPES = ['int8', 'int4', 'text', 'text', 'float8', 'float8', 'text'] as const;

const lineRow = z.object({
    line_index: z.number(),
    speaker_name: z.string(),
    speaker_role: z.enum(['manager', 'client']),
    start_time_seconds: z.number(),
    end_time_seconds: z.number(),
    text: z.string(),
});

function toLineRow(
    line: CallTranscriptLine,
): [number, number, string, string, number, number, string] {
    return [
        line.callId,
        line.lineIndex,
        line.speakerName,
        line.speakerRole,
        line.startTimeSeconds,
        line.endTimeSeconds,
        line.text,
    ];
}

function toLine(callId: number, row: ReturnType<typeof lineRow.parse>): CallTranscriptLine {
    return new CallTranscriptLine({
        callId,
        lineIndex: row.line_index,
        speakerName: row.speaker_name,
        speakerRole: row.speaker_role,
        startTimeSeconds: row.start_time_seconds,
        endTimeSeconds: row.end_time_seconds,
        text: row.text,
    });
}

@Injectable()
export class CallTranscriptRepository extends CallTranscriptRepositoryPort {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async exists(callId: CallId): Promise<boolean> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT 1 AS present FROM vocal_ai_call_transcript_lines WHERE call_id = ${callId.value}
            LIMIT 1`);
        return row !== null;
    }

    async save(transcript: CallTranscript): Promise<void> {
        const callId = transcript.callId.value;
        await this.transactions.run(async () => {
            const executor = this.transactions.executor();
            await executor.query(
                sql.unsafe`DELETE FROM vocal_ai_call_transcript_lines WHERE call_id = ${callId}`,
            );
            if (transcript.lines.length === 0) return;
            await executor.query(sql.unsafe`
                INSERT INTO vocal_ai_call_transcript_lines
                    (call_id, line_index, speaker_name, speaker_role, start_time_seconds,
                     end_time_seconds, text)
                SELECT * FROM ${sql.unnest(transcript.lines.map(toLineRow), [
                    ...LINE_COLUMN_TYPES,
                ])} AS l (call_id, line_index, speaker_name, speaker_role, start_time_seconds,
                          end_time_seconds, text)`);
        });
    }

    async findByCallId(callId: CallId): Promise<CallTranscript | null> {
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT line_index, speaker_name, speaker_role, start_time_seconds, end_time_seconds,
                   text
            FROM vocal_ai_call_transcript_lines
            WHERE call_id = ${callId.value}
            ORDER BY line_index`);
        if (rows.length === 0) return null;
        const lines = rows.map((raw) => toLine(callId.value, lineRow.parse(raw)));
        return CallTranscript.create({ callId, lines });
    }
}
