import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TranscriptNotReadyError } from '../domain/errors';
import { EvidenceValidator } from '../domain/evidence-validator';
import type { ExtractedMeetingTask, RawExtractedTask } from '../domain/extracted-meeting-task';
import { MeetingDueDateResolver } from '../domain/meeting-due-date-resolver';
import { formatTimecode } from '../domain/meeting-time-format';
import { MeetingFilesPort } from '../domain/ports/meeting-files.port';
import { MeetingTranscriptRepositoryPort } from '../domain/ports/meeting-transcript-repository.port';
import { TaskExtractorPort } from '../domain/ports/task-extractor.port';
import { TranscriptSegmentRepositoryPort } from '../domain/ports/transcript-segment-repository.port';
import type { SpeakerNames } from '../domain/speaker-names';
import type { TranscriptSegment } from '../domain/transcript-segment';
import { findOwnedTranscript } from './find-owned-transcript';
import { describeRecording } from './recording-info';

/** Нарезка длинной расшифровки на окна. */
export abstract class ExtractMeetingTasksSettings {
    /** Порог оценки токенов, после которого расшифровка режется на окна. */
    abstract readonly windowTokens: number;
    abstract readonly windowSec: number;
    abstract readonly overlapSec: number;
}

export interface ExtractMeetingTasksInput {
    ownerId: string;
    fileId: string;
}

/** Грубая оценка для русского текста: около трёх символов на токен. */
const CHARS_PER_TOKEN = 3;

/** Сколько окон расшифровки отправляется в модель одновременно, чтобы не упереться в лимиты провайдера. */
const MAX_PARALLEL_WINDOWS = 3;

/**
 * Извлекает задачи из готовой расшифровки: реплики `[seq] [чч:мм:сс] Имя: текст` уходят в
 * `TaskExtractorPort` целиком или окнами с перекрытием (результаты окон сливаются вторым
 * вызовом). Задачи без подтверждённого основания отбрасываются, сроки считаются от даты
 * загрузки записи. Ничего не сохраняет. 404 — чужая, 409 — не готова.
 */
@Injectable()
export class ExtractMeetingTasksUseCase {
    constructor(
        private readonly transcripts: MeetingTranscriptRepositoryPort,
        private readonly segments: TranscriptSegmentRepositoryPort,
        private readonly extractor: TaskExtractorPort,
        private readonly files: MeetingFilesPort,
        private readonly settings: ExtractMeetingTasksSettings,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(ExtractMeetingTasksUseCase.name);
    }

    async execute({ ownerId, fileId }: ExtractMeetingTasksInput): Promise<ExtractedMeetingTask[]> {
        const transcript = await findOwnedTranscript(this.transcripts, ownerId, fileId);
        if (transcript.status === 'no_speech') return [];
        if (transcript.status !== 'completed') {
            throw new TranscriptNotReadyError(
                `Tasks can be extracted only from a completed transcript, status is ${transcript.status}`,
            );
        }
        const startedAt = Date.now();
        const [recording, segments] = await Promise.all([
            describeRecording(this.files, transcript),
            this.segments.readAll(fileId),
        ]);
        const names = transcript.speakerNames;
        const bySeq = new Map(segments.map((s) => [s.seq, s]));
        const context = {
            participants: participantsOf(transcript.speakerCount, names),
            meetingDate: recording.uploadedAt,
        };

        const windows = this.windowsOf(segments, names);
        const extracted: RawExtractedTask[][] = [];
        for (let i = 0; i < windows.length; i += MAX_PARALLEL_WINDOWS) {
            const batch = windows.slice(i, i + MAX_PARALLEL_WINDOWS);
            extracted.push(
                ...(await Promise.all(
                    batch.map((lines) => this.extractor.extract(lines, context)),
                )),
            );
        }
        let found = 0;
        let dropped = 0;
        const batches: RawExtractedTask[][] = [];
        for (const raw of extracted) {
            const valid = EvidenceValidator.filter(raw, bySeq);
            found += raw.length;
            dropped += raw.length - valid.length;
            if (valid.length > 0) batches.push(valid);
        }
        let tasks = batches[0] ?? [];
        if (batches.length > 1) {
            const merged = await this.extractor.merge(batches);
            tasks = EvidenceValidator.filter(merged, bySeq);
            dropped += merged.length - tasks.length;
        }

        const result = tasks.flatMap((task) =>
            toExtractedTask(task, bySeq, names, recording.uploadedAt),
        );
        this.logger.info(
            {
                fileId,
                segments: segments.length,
                windows: windows.length,
                found,
                kept: result.length,
                dropped,
                durationMs: Date.now() - startedAt,
            },
            'Meeting tasks extracted',
        );
        return result;
    }

    /** Одно окно, если расшифровка помещается в порог, иначе окна по времени с перекрытием. */
    private windowsOf(segments: readonly TranscriptSegment[], names: SpeakerNames): string[][] {
        const lines = segments.map((s) => toLine(s, names));
        const chars = lines.reduce((sum, line) => sum + line.length, 0);
        if (segments.length === 0 || chars / CHARS_PER_TOKEN <= this.settings.windowTokens) {
            return [lines];
        }
        const { windowSec, overlapSec } = this.settings;
        const lastStart = Math.max(...segments.map((s) => s.startSec));
        const windows: string[][] = [];
        for (let from = 0; from <= lastStart; from += windowSec) {
            const to = from + windowSec + overlapSec;
            const window = segments
                .map((s, i) => ({ s, line: lines[i] ?? '' }))
                .filter(({ s }) => s.startSec >= from && s.startSec < to)
                .map(({ line }) => line);
            if (window.length > 0) windows.push(window);
        }
        return windows;
    }
}

function toLine(segment: TranscriptSegment, names: SpeakerNames): string {
    return `[${String(segment.seq)}] [${formatTimecode(segment.startSec)}] ${names.labelOf(segment.speaker)}: ${segment.text}`;
}

function participantsOf(speakerCount: number, names: SpeakerNames): string[] {
    return [...new Set(Array.from({ length: speakerCount }, (_, i) => names.labelOf(i + 1)))];
}

// Tasks reach here after EvidenceValidator, so a task without a segment is only a guard.
function toExtractedTask(
    task: RawExtractedTask,
    bySeq: ReadonlyMap<number, TranscriptSegment>,
    names: SpeakerNames,
    meetingDate: Date,
): ExtractedMeetingTask[] {
    const evidence = task.evidence;
    const segment = evidence === null ? undefined : bySeq.get(evidence.seq);
    if (evidence === null || segment === undefined) return [];
    const assignee = task.assigneeMention?.trim() ?? '';
    return [
        {
            title: task.title.trim(),
            description: task.description.trim(),
            assigneeMention: assignee.length > 0 ? assignee : null,
            due: MeetingDueDateResolver.resolve(task.dueText, meetingDate),
            evidence: {
                seq: segment.seq,
                startSec: segment.startSec,
                speakerLabel: names.labelOf(segment.speaker),
                quote: evidence.quote.trim(),
            },
        },
    ];
}
