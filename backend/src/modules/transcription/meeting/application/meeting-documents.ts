import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
    DocumentModel,
    DocumentRendererPort,
    type DocumentBlock,
} from '../../../../shared/documents';
import { TranscriptNotReadyError } from '../domain/errors';
import type { ExtractedMeetingTask } from '../domain/extracted-meeting-task';
import type { MeetingTranscript } from '../domain/meeting-transcript';
import {
    meetingDocumentFileName,
    meetingDocumentTitle,
    type MeetingDocumentKind,
} from '../domain/meeting-document-kind';
import {
    formatMoscowDate,
    formatMoscowDateTime,
    formatTimecode,
} from '../domain/meeting-time-format';
import { MeetingFilesPort, type MeetingDocumentFile } from '../domain/ports/meeting-files.port';
import { MeetingTranscriptRepositoryPort } from '../domain/ports/meeting-transcript-repository.port';
import { TranscriptSegmentRepositoryPort } from '../domain/ports/transcript-segment-repository.port';
import type { SpeakerNames } from '../domain/speaker-names';
import type { TranscriptSegment } from '../domain/transcript-segment';
import { findOwnedTranscript } from './find-owned-transcript';
import { describeRecording } from './recording-info';

export interface IssueTranscriptDocumentInput {
    ownerId: string;
    fileId: string;
}

export interface IssueTasksDocumentInput {
    ownerId: string;
    fileId: string;
    tasks: readonly ExtractedMeetingTask[];
}

interface Replica {
    readonly startSec: number;
    readonly label: string;
    readonly text: string;
}

const TASKS_HEADER = [
    '№',
    'Задача',
    'Описание',
    'Исполнитель',
    'Постановщик',
    'Срок',
    'Основание',
] as const;

/**
 * Документы встречи: расшифровка с текущими именами и список извлечённых задач. Собирает
 * `DocumentModel`, рендерит общим генератором и сохраняет через `StoreGeneratedFile`.
 * Каждый вызов — новый файл. Источник данных — расшифровка, поэтому документ собирается и
 * после удаления записи. В лог не попадают ни текст, ни имена.
 */
@Injectable()
export class MeetingDocuments {
    constructor(
        private readonly transcripts: MeetingTranscriptRepositoryPort,
        private readonly segments: TranscriptSegmentRepositoryPort,
        private readonly renderer: DocumentRendererPort,
        private readonly files: MeetingFilesPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(MeetingDocuments.name);
    }

    /** 404 — чужая или нет, 409 — расшифровка не `completed`. */
    async issueTranscript({
        ownerId,
        fileId,
    }: IssueTranscriptDocumentInput): Promise<MeetingDocumentFile> {
        const transcript = await this.completedTranscript(ownerId, fileId);
        const [recording, segments] = await Promise.all([
            describeRecording(this.files, transcript),
            this.segments.readAll(fileId),
        ]);
        const replicas = mergeReplicas(segments, transcript.speakerNames);
        const participants = participantsOf(transcript);
        const doc = DocumentModel.of({
            title: meetingDocumentTitle('transcript', recording.name),
            blocks: [
                labelled('Дата загрузки', formatMoscowDate(recording.uploadedAt)),
                labelled('Длительность', formatTimecode(transcript.durationSec ?? 0)),
                labelled('Участники', participants.join(', ')),
                { kind: 'heading', text: 'Реплики' },
                ...replicas.map(replicaBlock),
            ],
        });
        return this.store('transcript', ownerId, fileId, recording.name, doc, replicas.length);
    }

    /** 404 — чужая или нет. */
    async issueTasks({
        ownerId,
        fileId,
        tasks,
    }: IssueTasksDocumentInput): Promise<MeetingDocumentFile> {
        const transcript = await findOwnedTranscript(this.transcripts, ownerId, fileId);
        const recording = await describeRecording(this.files, transcript);
        const doc = DocumentModel.of({
            title: meetingDocumentTitle('tasks', recording.name),
            blocks: [
                labelled('Дата встречи', formatMoscowDate(recording.uploadedAt)),
                {
                    kind: 'table',
                    header: TASKS_HEADER,
                    rows: tasks.map((task, i) => [
                        String(i + 1),
                        task.title,
                        orNull(task.description),
                        orNull(task.assigneeMention),
                        // Постановщика в речи нет: его выбирают при постановке задач.
                        null,
                        task.due === null ? null : formatMoscowDateTime(task.due),
                        `[${formatTimecode(task.evidence.startSec)}] ${task.evidence.speakerLabel}: «${task.evidence.quote}»`,
                    ]),
                },
            ],
        });
        return this.store('tasks', ownerId, fileId, recording.name, doc, tasks.length);
    }

    private async completedTranscript(ownerId: string, fileId: string): Promise<MeetingTranscript> {
        const transcript = await findOwnedTranscript(this.transcripts, ownerId, fileId);
        if (transcript.status !== 'completed') {
            throw new TranscriptNotReadyError(
                `A transcript document needs a completed transcript, status is ${transcript.status}`,
            );
        }
        return transcript;
    }

    private async store(
        kind: MeetingDocumentKind,
        ownerId: string,
        fileId: string,
        recordingName: string,
        doc: DocumentModel,
        count: number,
    ): Promise<MeetingDocumentFile> {
        const buffer = await this.renderer.render(doc);
        const file = await this.files.storeDocument({
            ownerId,
            name: meetingDocumentFileName(kind, recordingName, this.renderer.extension),
            mediaType: this.renderer.mediaType,
            buffer,
        });
        this.logger.info(
            { fileId, kind, count, sizeBytes: file.sizeBytes, documentId: file.id },
            'Meeting document issued',
        );
        return file;
    }
}

/** Подряд идущие реплики с одной подписью (в том числе разных спикеров с одним именем) — одна. */
function mergeReplicas(segments: readonly TranscriptSegment[], names: SpeakerNames): Replica[] {
    const replicas: Replica[] = [];
    for (const segment of segments) {
        const label = names.labelOf(segment.speaker);
        const last = replicas.at(-1);
        if (last?.label === label) {
            replicas[replicas.length - 1] = { ...last, text: `${last.text} ${segment.text}` };
        } else {
            replicas.push({ startSec: segment.startSec, label, text: segment.text });
        }
    }
    return replicas;
}

/** Подписи всех спикеров `1..speakerCount` без повторов, в порядке номеров. */
function participantsOf(transcript: MeetingTranscript): string[] {
    const labels = Array.from({ length: transcript.speakerCount }, (_, i) =>
        transcript.speakerNames.labelOf(i + 1),
    );
    return [...new Set(labels)];
}

function labelled(label: string, value: string): DocumentBlock {
    return { kind: 'paragraph', runs: [{ text: `${label}: `, bold: true }, { text: value }] };
}

function replicaBlock(replica: Replica): DocumentBlock {
    return {
        kind: 'paragraph',
        runs: [
            { text: `[${formatTimecode(replica.startSec)}] ` },
            { text: `${replica.label}:`, bold: true },
            { text: ` ${replica.text}` },
        ],
    };
}

function orNull(value: string | null): string | null {
    const trimmed = value?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : null;
}
