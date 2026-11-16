import { tool } from 'langchain';
import { z } from 'zod';
import { type AgentRunContext, AttachmentRef } from '../../../../../shared/agent-capability';
import { FileGoneError } from '../../../../files/domain/errors';
import { MeetingTranscriptNotFoundError } from '../../application/errors';
import type { ExtractMeetingTasksUseCase } from '../../application/extract-meeting-tasks.use-case';
import type { GetMeetingTranscriptUseCase } from '../../application/get-meeting-transcript.use-case';
import type { GetSpeakerSamplesUseCase } from '../../application/get-speaker-samples.use-case';
import type { MeetingDocuments } from '../../application/meeting-documents';
import type { RenameSpeakersUseCase } from '../../application/rename-speakers.use-case';
import type { RetryMeetingTranscriptionUseCase } from '../../application/retry-meeting-transcription.use-case';
import {
    InvalidSpeakerNameError,
    MeetingTranscriptNotRetryableError,
    TranscriptNotReadyError,
    UnknownSpeakerError,
} from '../../domain/errors';
import type { ExtractedMeetingTask } from '../../domain/extracted-meeting-task';
import type { MeetingDocumentFile, MeetingFilesPort } from '../../domain/ports/meeting-files.port';
import { formatMoscowDateTime, formatTimecode } from '../../domain/meeting-time-format';
import { defaultSpeakerLabel } from '../../domain/speaker-names';
import type { SpeakerSummary } from '../../domain/speaker-summary';
import type { TranscriptSegment } from '../../domain/transcript-segment';
import type { TranscriptionStatus } from '../../domain/transcription-status';

export interface MeetingToolsDeps {
    readonly getTranscript: Pick<GetMeetingTranscriptUseCase, 'execute'>;
    readonly speakerSamples: Pick<GetSpeakerSamplesUseCase, 'execute'>;
    readonly renameSpeakers: Pick<RenameSpeakersUseCase, 'execute'>;
    readonly extractTasks: Pick<ExtractMeetingTasksUseCase, 'execute'>;
    readonly retryTranscription: Pick<RetryMeetingTranscriptionUseCase, 'execute'>;
    readonly documents: Pick<MeetingDocuments, 'issueTranscript' | 'issueTasks'>;
    readonly files: Pick<MeetingFilesPort, 'findFile'>;
}

const NOT_FOUND = 'Расшифровка не найдена';
const IN_PROGRESS =
    'Расшифровка ещё не готова: она идёт, результат придёт в этот чат отдельным сообщением';

function json(value: unknown): string {
    return JSON.stringify(value);
}

function label(speaker: number, name: string | null): string {
    return name ?? defaultSpeakerLabel(speaker);
}

function percent(share: number): string {
    return `${String(Math.round(share * 100))}%`;
}

function speakerView(s: SpeakerSummary): Record<string, unknown> {
    return {
        speaker: s.speaker,
        label: label(s.speaker, s.name),
        name: s.name,
        talkShare: percent(s.talkShare),
    };
}

/** Документ из ответа агента: клиент получит его карточкой, ответ сохранит его с сообщением. */
function attach(ctx: AgentRunContext, file: MeetingDocumentFile): void {
    ctx.attachments.add(
        AttachmentRef.of({
            fileId: file.id,
            name: file.name,
            mediaType: file.mediaType,
            kind: 'document',
            sizeBytes: file.sizeBytes,
        }),
    );
}

/** Ожидаемые отказы — текст для модели; неизвестные ошибки не глотаются. */
function explain(error: unknown): string {
    if (error instanceof MeetingTranscriptNotFoundError) return NOT_FOUND;
    if (error instanceof TranscriptNotReadyError) return IN_PROGRESS;
    if (error instanceof UnknownSpeakerError) {
        const missing = error.speakers.map((n) => `Спикер ${String(n)}`).join(', ');
        return `В расшифровке нет: ${missing}. Имена не изменены: уточни у пользователя, кого он имел в виду`;
    }
    if (error instanceof InvalidSpeakerNameError) {
        return 'Имя должно быть от 1 до 100 символов. Имена не изменены';
    }
    if (error instanceof FileGoneError) {
        return 'Запись уже удалена, повторить расшифровку нельзя: попроси пользователя загрузить её заново';
    }
    if (error instanceof MeetingTranscriptNotRetryableError) {
        return 'Повтор не нужен: расшифровку повторяют только после сбоя. Проверь статус через get_meeting_transcript';
    }
    throw error;
}

function statusHint(status: TranscriptionStatus, failureReason: string | null): string {
    switch (status) {
        case 'pending':
        case 'processing':
            return 'Расшифровка идёт: скажи, что результат придёт в этот чат, и не жди его';
        case 'completed':
            return 'Расшифровка готова';
        case 'no_speech':
            return 'Речь в записи не найдена: попроси проверить файл, повтор не предлагай';
        case 'failed':
            return failureReason === 'provider-unavailable' || failureReason === 'timeout'
                ? 'Сбой расшифровки: назови причину и предложи повторить (retry_transcription после согласия)'
                : 'Сбой расшифровки: назови причину, повтор не поможет';
    }
}

function taskView(task: ExtractedMeetingTask, index: number): Record<string, unknown> {
    const description = task.description.trim();
    return {
        number: index + 1,
        title: task.title,
        description: description.length > 0 ? description : null,
        assignee: task.assigneeMention,
        due: task.due === null ? null : formatMoscowDateTime(task.due),
        evidence: `[${formatTimecode(task.evidence.startSec)}] ${task.evidence.speakerLabel}: «${task.evidence.quote}»`,
    };
}

function samplesOf(samples: readonly TranscriptSegment[], speaker: number): unknown[] {
    return samples
        .filter((s) => s.speaker === speaker)
        .map((s) => ({ at: formatTimecode(s.startSec), text: s.text }));
}

const fileIdSchema = z
    .string()
    .describe('Id of the meeting recording: the id of a "recording" file from a [Вложения] block');

/**
 * Инструменты специалиста по встречам поверх use case'ов `transcription/meeting`.
 * Пользователь берётся только из контекста запуска. Текст расшифровки целиком агенту не
 * отдаётся: только сводки, примеры реплик и задачи с основаниями.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- tool() generics are inferred per tool
export function createMeetingTools(deps: MeetingToolsDeps, ctx: AgentRunContext) {
    const ownerId = ctx.userId;

    /** Расшифровки ещё нет, но запись своя: строка создаётся сразу после загрузки. */
    async function pendingOwnRecording(fileId: string): Promise<boolean> {
        const file = await deps.files.findFile(ownerId, fileId);
        return file !== null && file.isRecording && file.isStored;
    }

    const getMeetingTranscript = tool(
        async ({ fileId, withDocument }) => {
            try {
                const view = await deps.getTranscript.execute({ ownerId, fileId });
                const result: Record<string, unknown> = {
                    found: true,
                    status: view.status,
                    failureReason: view.failureReason,
                    duration: view.durationSec === null ? null : formatTimecode(view.durationSec),
                    speakerCount: view.speakerCount,
                    speakers: (view.speakers ?? []).map(speakerView),
                    hint: statusHint(view.status, view.failureReason),
                };
                if (withDocument === true && view.status === 'completed') {
                    const file = await deps.documents.issueTranscript({ ownerId, fileId });
                    attach(ctx, file);
                    result.document = file.name;
                }
                return json(result);
            } catch (error) {
                if (
                    error instanceof MeetingTranscriptNotFoundError &&
                    (await pendingOwnRecording(fileId))
                ) {
                    return json({
                        found: true,
                        status: 'pending',
                        hint: statusHint('pending', null),
                    });
                }
                return json({ found: false, error: explain(error) });
            }
        },
        {
            name: 'get_meeting_transcript',
            description:
                'Status of the transcript of a meeting recording of the current user: duration and speakers with names and share of talk time, without the replicas. With withDocument=true and a completed transcript also attaches the transcript document to the answer.',
            schema: z.object({
                fileId: fileIdSchema,
                withDocument: z
                    .boolean()
                    .optional()
                    .describe('Attach the transcript document to the answer (completed only)'),
            }),
        },
    );

    const getSpeakerSamples = tool(
        async ({ fileId }) => {
            try {
                const { speakers, samples } = await deps.speakerSamples.execute({
                    ownerId,
                    fileId,
                });
                return json({
                    speakers: speakers.map((s) => ({
                        ...speakerView(s),
                        samples: samplesOf(samples, s.speaker),
                    })),
                });
            } catch (error) {
                return json({ error: explain(error) });
            }
        },
        {
            name: 'get_speaker_samples',
            description:
                'Every speaker of a completed transcript with the current name, share of talk time and 2-3 characteristic replicas with timecodes, to help the user tell who is who.',
            schema: z.object({ fileId: fileIdSchema }),
        },
    );

    const renameSpeakers = tool(
        async ({ fileId, assignments }) => {
            try {
                const speakers = await deps.renameSpeakers.execute({
                    ownerId,
                    fileId,
                    assignments: assignments.map(({ speaker, name }) => ({ speaker, name })),
                });
                const file = await deps.documents.issueTranscript({ ownerId, fileId });
                attach(ctx, file);
                return json({
                    renamed: true,
                    document: file.name,
                    speakers: speakers.map((s) => ({
                        speaker: s.speaker,
                        label: label(s.speaker, s.name),
                    })),
                });
            } catch (error) {
                return json({ renamed: false, error: explain(error) });
            }
        },
        {
            name: 'rename_speakers',
            description:
                'Assign names to several speakers at once (all or nothing) and attach the new transcript document to the answer. Several speakers may get the same name. name=null resets a speaker to "Спикер N". Never changes the text of replicas.',
            schema: z.object({
                fileId: fileIdSchema,
                assignments: z
                    .array(
                        z.object({
                            speaker: z
                                .number()
                                .int()
                                .describe('Speaker number N from the label "Спикер N"'),
                            name: z
                                .string()
                                .nullable()
                                .describe('Name exactly as the user wrote it; null resets'),
                        }),
                    )
                    .min(1),
            }),
        },
    );

    const extractMeetingTasks = tool(
        async ({ fileId }) => {
            try {
                const tasks = await deps.extractTasks.execute({ ownerId, fileId });
                if (tasks.length === 0) return json({ found: 0, tasks: [] });
                const file = await deps.documents.issueTasks({ ownerId, fileId, tasks });
                attach(ctx, file);
                return json({
                    found: tasks.length,
                    document: file.name,
                    tasks: tasks.map(taskView),
                });
            } catch (error) {
                return json({ error: explain(error) });
            }
        },
        {
            name: 'extract_meeting_tasks',
            description:
                'Find assignments and agreed actions in a completed transcript. Every task has evidence (timecode, speaker, quote); assignee and due are null when not said. Attaches the task list document to the answer when tasks are found. Creates nothing in the task system.',
            schema: z.object({ fileId: fileIdSchema }),
        },
    );

    const retryTranscription = tool(
        async ({ fileId }) => {
            try {
                await deps.retryTranscription.execute({ ownerId, fileId });
                return json({
                    restarted: true,
                    status: 'pending',
                    hint: 'Расшифровка перезапущена: результат придёт в этот чат',
                });
            } catch (error) {
                return json({ restarted: false, error: explain(error) });
            }
        },
        {
            name: 'retry_transcription',
            description:
                'Restart a failed transcription while the recording is stored. Call only after the user asked or agreed.',
            schema: z.object({ fileId: fileIdSchema }),
        },
    );

    return {
        getMeetingTranscript,
        getSpeakerSamples,
        renameSpeakers,
        extractMeetingTasks,
        retryTranscription,
    };
}
