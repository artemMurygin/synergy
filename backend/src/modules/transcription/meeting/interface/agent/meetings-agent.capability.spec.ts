import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRunContext } from '../../../../../shared/agent-capability';
import { FileNotFoundError } from '../../../../files/application/errors';
import type { StoredFileView } from '../../../../files/application/stored-file-view';
import { FileGoneError } from '../../../../files/domain/errors';
import { MeetingTranscriptNotFoundError } from '../../application/errors';
import type { MeetingTranscriptView } from '../../application/meeting-transcript-view';
import {
    MeetingTranscriptNotRetryableError,
    TranscriptNotReadyError,
    UnknownSpeakerError,
} from '../../domain/errors';
import type { ExtractedMeetingTask } from '../../domain/extracted-meeting-task';
import { TranscriptSegment } from '../../domain/transcript-segment';

const createAgent = vi.hoisted(() => vi.fn());

vi.mock('langchain', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createAgent,
}));

import { buildMeetingsAgentPrompt } from './meetings-agent-prompt';
import { MeetingsAgentCapability } from './meetings-agent.capability';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const SECRET_REPLICA = 'Секретная реплика, которой не место в контексте агента';
const model = { name: 'fake-model' } as unknown as BaseChatModel;

const deps = {
    getTranscript: { execute: vi.fn() },
    speakerSamples: { execute: vi.fn() },
    renameSpeakers: { execute: vi.fn() },
    extractTasks: { execute: vi.fn() },
    retryTranscription: { execute: vi.fn() },
    documents: { issueTranscript: vi.fn(), issueTasks: vi.fn() },
    getFile: { execute: vi.fn() },
};

interface Tool {
    name: string;
    invoke(input: unknown): Promise<unknown>;
}

function document(id: string, name: string): StoredFileView {
    return {
        id,
        name,
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        kind: 'document',
        sizeBytes: 4096,
        status: 'active',
        awaitingProcessing: false,
        uploadedAt: new Date('2026-11-12T10:00:00Z'),
        expiresAt: new Date('2026-12-12T10:00:00Z'),
        deletedAt: null,
    };
}

function completedView(): MeetingTranscriptView {
    return {
        fileId: FILE_ID,
        status: 'completed',
        failureReason: null,
        language: 'ru',
        durationSec: 4360,
        speakerCount: 2,
        speakers: [
            { speaker: 1, name: 'Анна', talkSec: 3000, talkShare: 0.7 },
            { speaker: 2, name: null, talkSec: 1300, talkShare: 0.3 },
        ],
        segments: [{ seq: 0, speaker: 1, startSec: 0, endSec: 5, text: SECRET_REPLICA }],
        completedAt: new Date('2026-11-12T09:00:00Z'),
    };
}

const TASKS: ExtractedMeetingTask[] = [
    {
        title: 'Подготовить смету',
        description: 'Смета по проекту',
        assigneeMention: 'Олег',
        due: new Date('2026-11-13T15:00:00Z'),
        evidence: { seq: 2, startSec: 65, speakerLabel: 'Олег', quote: 'подготовлю смету' },
    },
    {
        title: 'Обновить договор',
        description: '',
        assigneeMention: null,
        due: null,
        evidence: { seq: 3, startSec: 70, speakerLabel: 'Спикер 2', quote: 'обновить договор' },
    },
];

function capability(): MeetingsAgentCapability {
    return new MeetingsAgentCapability(deps, model);
}

function toolsOf(ctx: AgentRunContext): Record<string, Tool> {
    capability().buildAgent(ctx);
    const { tools } = createAgent.mock.calls.at(-1)?.[0] as { tools: Tool[] };
    return Object.fromEntries(tools.map((t) => [t.name, t]));
}

async function call(tool: Tool, input: unknown): Promise<Record<string, unknown>> {
    return JSON.parse(String(await tool.invoke(input))) as Record<string, unknown>;
}

let ctx: AgentRunContext;

beforeEach(() => {
    vi.clearAllMocks();
    createAgent.mockReset();
    createAgent.mockReturnValue({ invoke: vi.fn() });
    ctx = AgentRunContext.create({ userId: 'u-1', threadId: 't-1' });
});

describe('MeetingsAgentCapability', () => {
    it('is named meetings, forks the caller context and describes when to pick it', () => {
        const meetings = capability();

        expect(meetings.name).toBe('meetings');
        expect(meetings.mode).toBe('fork');
        expect(meetings.description).toMatch(/запис/i);
        expect(meetings.description).toMatch(/расшифров/i);
        expect(meetings.description).toMatch(/спикер/i);
        expect(meetings.description).toMatch(/задач/i);
    });

    it('builds an agent with exactly the five meeting tools and the meetings prompt', () => {
        capability().buildAgent(ctx);

        expect(createAgent).toHaveBeenCalledTimes(1);
        const options = createAgent.mock.calls[0][0] as {
            tools: { name: string }[];
            model: unknown;
            systemPrompt: string;
        };
        expect(options.tools.map((t) => t.name).sort()).toEqual([
            'extract_meeting_tasks',
            'get_meeting_transcript',
            'get_speaker_samples',
            'rename_speakers',
            'retry_transcription',
        ]);
        expect(options.model).toBe(model);
        expect(options.systemPrompt).toBe(buildMeetingsAgentPrompt());
    });

    it('returns the agent created by createAgent', () => {
        const agent = { invoke: vi.fn() };
        createAgent.mockReturnValue(agent);

        expect(capability().buildAgent(ctx)).toBe(agent);
    });

    it('passes the checkpointer when given and omits it otherwise', () => {
        const checkpointer = {} as BaseCheckpointSaver;

        capability().buildAgent(ctx, { checkpointer });
        capability().buildAgent(ctx);

        expect((createAgent.mock.calls[0][0] as { checkpointer?: unknown }).checkpointer).toBe(
            checkpointer,
        );
        expect(createAgent.mock.calls[1][0]).not.toHaveProperty('checkpointer');
    });

    it('gives the agent no tools that create tasks or accept a user', () => {
        capability().buildAgent(ctx);

        const { tools } = createAgent.mock.calls[0][0] as {
            tools: { name: string; schema: { shape: Record<string, unknown> } }[];
        };
        expect(tools.map((t) => t.name).join(' ')).not.toMatch(/create|propose|delete/);
        for (const t of tools) {
            expect(Object.keys(t.schema.shape)).not.toEqual(expect.arrayContaining(['userId']));
            expect(Object.keys(t.schema.shape)).not.toEqual(expect.arrayContaining(['ownerId']));
        }
    });
});

describe('meeting tools', () => {
    describe('get_meeting_transcript', () => {
        it('returns a summary of the user transcript without the replicas', async () => {
            deps.getTranscript.execute.mockResolvedValue(completedView());
            const { get_meeting_transcript } = toolsOf(ctx);

            const raw = String(await get_meeting_transcript.invoke({ fileId: FILE_ID }));
            const result = JSON.parse(raw) as Record<string, unknown>;

            expect(deps.getTranscript.execute).toHaveBeenCalledWith({
                ownerId: 'u-1',
                fileId: FILE_ID,
            });
            expect(raw).not.toContain(SECRET_REPLICA);
            expect(result).toMatchObject({
                found: true,
                status: 'completed',
                duration: '01:12:40',
                speakerCount: 2,
                speakers: [
                    { speaker: 1, label: 'Анна', name: 'Анна', talkShare: '70%' },
                    { speaker: 2, label: 'Спикер 2', name: null, talkShare: '30%' },
                ],
            });
            expect(deps.documents.issueTranscript).not.toHaveBeenCalled();
            expect(ctx.attachments.list()).toEqual([]);
        });

        it('issues the transcript document into the answer when asked', async () => {
            deps.getTranscript.execute.mockResolvedValue(completedView());
            deps.documents.issueTranscript.mockResolvedValue(
                document('doc-1', 'Расшифровка — встреча.docx'),
            );
            const { get_meeting_transcript } = toolsOf(ctx);

            const result = await call(get_meeting_transcript, {
                fileId: FILE_ID,
                withDocument: true,
            });

            expect(deps.documents.issueTranscript).toHaveBeenCalledWith({
                ownerId: 'u-1',
                fileId: FILE_ID,
            });
            expect(ctx.attachments.list().map((f) => f.fileId)).toEqual(['doc-1']);
            expect(ctx.attachments.list()[0]).toMatchObject({
                name: 'Расшифровка — встреча.docx',
                kind: 'document',
            });
            expect(result.document).toBe('Расшифровка — встреча.docx');
        });

        it('reports the failure reason and whether a retry is possible', async () => {
            deps.getTranscript.execute.mockResolvedValue({
                ...completedView(),
                status: 'failed',
                failureReason: 'provider-unavailable',
                speakers: null,
                segments: null,
            });
            const { get_meeting_transcript } = toolsOf(ctx);

            const result = await call(get_meeting_transcript, { fileId: FILE_ID });

            expect(result).toMatchObject({
                found: true,
                status: 'failed',
                failureReason: 'provider-unavailable',
            });
            expect(String(result.hint)).toMatch(/retry_transcription/);
        });

        it('says "not found" for a transcript of another user', async () => {
            deps.getTranscript.execute.mockRejectedValue(
                new MeetingTranscriptNotFoundError(FILE_ID),
            );
            deps.getFile.execute.mockRejectedValue(new FileNotFoundError(FILE_ID));
            const { get_meeting_transcript } = toolsOf(ctx);

            const result = await call(get_meeting_transcript, { fileId: FILE_ID });

            expect(result.found).toBe(false);
            expect(String(result.error)).toMatch(/не найдена/);
            expect(deps.getFile.execute).toHaveBeenCalledWith({ ownerId: 'u-1', fileId: FILE_ID });
        });

        it('treats an own just uploaded recording without a transcript yet as pending', async () => {
            deps.getTranscript.execute.mockRejectedValue(
                new MeetingTranscriptNotFoundError(FILE_ID),
            );
            deps.getFile.execute.mockResolvedValue({
                ...document(FILE_ID, 'встреча.m4a'),
                kind: 'recording',
            });
            const { get_meeting_transcript } = toolsOf(ctx);

            const result = await call(get_meeting_transcript, { fileId: FILE_ID });

            expect(result).toMatchObject({ found: true, status: 'pending' });
        });
    });

    describe('get_speaker_samples', () => {
        it('returns every speaker with 2–3 replicas and timecodes for the user', async () => {
            deps.speakerSamples.execute.mockResolvedValue({
                speakers: [
                    { speaker: 1, name: 'Анна', talkSec: 3000, talkShare: 0.7 },
                    { speaker: 2, name: null, talkSec: 1300, talkShare: 0.3 },
                ],
                samples: [
                    TranscriptSegment.of({
                        seq: 0,
                        speaker: 1,
                        startSec: 5,
                        endSec: 9,
                        text: 'Добрый день',
                    }),
                    TranscriptSegment.of({
                        seq: 7,
                        speaker: 2,
                        startSec: 3725,
                        endSec: 3730,
                        text: 'Смету пришлю',
                    }),
                ],
            });
            const { get_speaker_samples } = toolsOf(ctx);

            const result = await call(get_speaker_samples, { fileId: FILE_ID });

            expect(deps.speakerSamples.execute).toHaveBeenCalledWith({
                ownerId: 'u-1',
                fileId: FILE_ID,
            });
            expect(result.speakers).toEqual([
                {
                    speaker: 1,
                    label: 'Анна',
                    name: 'Анна',
                    talkShare: '70%',
                    samples: [{ at: '00:00:05', text: 'Добрый день' }],
                },
                {
                    speaker: 2,
                    label: 'Спикер 2',
                    name: null,
                    talkShare: '30%',
                    samples: [{ at: '01:02:05', text: 'Смету пришлю' }],
                },
            ]);
        });

        it('says "not found" for a transcript of another user', async () => {
            deps.speakerSamples.execute.mockRejectedValue(
                new MeetingTranscriptNotFoundError(FILE_ID),
            );
            const { get_speaker_samples } = toolsOf(ctx);

            const result = await call(get_speaker_samples, { fileId: FILE_ID });

            expect(String(result.error)).toMatch(/не найдена/);
        });
    });

    describe('rename_speakers', () => {
        it('assigns the names for the user and puts the new document into the answer', async () => {
            deps.renameSpeakers.execute.mockResolvedValue([
                { speaker: 1, name: 'Анна Петрова', talkSec: 10, talkShare: 0.5 },
                { speaker: 2, name: 'Олег', talkSec: 10, talkShare: 0.5 },
            ]);
            deps.documents.issueTranscript.mockResolvedValue(
                document('doc-2', 'Расшифровка — встреча.docx'),
            );
            const { rename_speakers } = toolsOf(ctx);

            const result = await call(rename_speakers, {
                fileId: FILE_ID,
                assignments: [
                    { speaker: 1, name: 'Анна Петрова' },
                    { speaker: 2, name: 'Олег' },
                ],
            });

            expect(deps.renameSpeakers.execute).toHaveBeenCalledWith({
                ownerId: 'u-1',
                fileId: FILE_ID,
                assignments: [
                    { speaker: 1, name: 'Анна Петрова' },
                    { speaker: 2, name: 'Олег' },
                ],
            });
            expect(deps.documents.issueTranscript).toHaveBeenCalledWith({
                ownerId: 'u-1',
                fileId: FILE_ID,
            });
            expect(ctx.attachments.list().map((f) => f.fileId)).toEqual(['doc-2']);
            expect(result).toMatchObject({
                renamed: true,
                document: 'Расшифровка — встреча.docx',
                speakers: [
                    { speaker: 1, label: 'Анна Петрова' },
                    { speaker: 2, label: 'Олег' },
                ],
            });
        });

        it('reports unknown speakers and issues no document', async () => {
            deps.renameSpeakers.execute.mockRejectedValue(new UnknownSpeakerError([3]));
            const { rename_speakers } = toolsOf(ctx);

            const result = await call(rename_speakers, {
                fileId: FILE_ID,
                assignments: [{ speaker: 3, name: 'Иван' }],
            });

            expect(result.renamed).toBe(false);
            expect(String(result.error)).toMatch(/Спикер 3/);
            expect(String(result.error)).toMatch(/не изменены/);
            expect(deps.documents.issueTranscript).not.toHaveBeenCalled();
            expect(ctx.attachments.list()).toEqual([]);
        });

        it('says "not found" for a transcript of another user', async () => {
            deps.renameSpeakers.execute.mockRejectedValue(
                new MeetingTranscriptNotFoundError(FILE_ID),
            );
            const { rename_speakers } = toolsOf(ctx);

            const result = await call(rename_speakers, {
                fileId: FILE_ID,
                assignments: [{ speaker: 1, name: 'Анна' }],
            });

            expect(String(result.error)).toMatch(/не найдена/);
        });
    });

    describe('extract_meeting_tasks', () => {
        it('extracts for the user, puts the document into the answer and returns a numbered list', async () => {
            deps.extractTasks.execute.mockResolvedValue(TASKS);
            deps.documents.issueTasks.mockResolvedValue(document('doc-3', 'Задачи — встреча.docx'));
            const { extract_meeting_tasks } = toolsOf(ctx);

            const result = await call(extract_meeting_tasks, { fileId: FILE_ID });

            expect(deps.extractTasks.execute).toHaveBeenCalledWith({
                ownerId: 'u-1',
                fileId: FILE_ID,
            });
            expect(deps.documents.issueTasks).toHaveBeenCalledWith({
                ownerId: 'u-1',
                fileId: FILE_ID,
                tasks: TASKS,
            });
            expect(ctx.attachments.list().map((f) => f.fileId)).toEqual(['doc-3']);
            expect(result).toMatchObject({
                found: 2,
                document: 'Задачи — встреча.docx',
                tasks: [
                    {
                        number: 1,
                        title: 'Подготовить смету',
                        description: 'Смета по проекту',
                        assignee: 'Олег',
                        due: '13.11.2026 18:00',
                        evidence: '[00:01:05] Олег: «подготовлю смету»',
                    },
                    {
                        number: 2,
                        title: 'Обновить договор',
                        description: null,
                        assignee: null,
                        due: null,
                        evidence: '[00:01:10] Спикер 2: «обновить договор»',
                    },
                ],
            });
        });

        it('creates no document when no tasks are found', async () => {
            deps.extractTasks.execute.mockResolvedValue([]);
            const { extract_meeting_tasks } = toolsOf(ctx);

            const result = await call(extract_meeting_tasks, { fileId: FILE_ID });

            expect(result).toMatchObject({ found: 0, tasks: [] });
            expect(deps.documents.issueTasks).not.toHaveBeenCalled();
            expect(ctx.attachments.list()).toEqual([]);
        });

        it('says the transcript is still in progress', async () => {
            deps.extractTasks.execute.mockRejectedValue(new TranscriptNotReadyError('processing'));
            const { extract_meeting_tasks } = toolsOf(ctx);

            const result = await call(extract_meeting_tasks, { fileId: FILE_ID });

            expect(String(result.error)).toMatch(/не готова|ещё идёт/);
            expect(deps.documents.issueTasks).not.toHaveBeenCalled();
        });

        it('says "not found" for a transcript of another user', async () => {
            deps.extractTasks.execute.mockRejectedValue(
                new MeetingTranscriptNotFoundError(FILE_ID),
            );
            const { extract_meeting_tasks } = toolsOf(ctx);

            const result = await call(extract_meeting_tasks, { fileId: FILE_ID });

            expect(String(result.error)).toMatch(/не найдена/);
        });
    });

    describe('retry_transcription', () => {
        it('restarts the transcription for the user', async () => {
            deps.retryTranscription.execute.mockResolvedValue(undefined);
            const { retry_transcription } = toolsOf(ctx);

            const result = await call(retry_transcription, { fileId: FILE_ID });

            expect(deps.retryTranscription.execute).toHaveBeenCalledWith({
                ownerId: 'u-1',
                fileId: FILE_ID,
            });
            expect(result).toMatchObject({ restarted: true, status: 'pending' });
        });

        it('tells that the recording is deleted and must be uploaded again', async () => {
            deps.retryTranscription.execute.mockRejectedValue(new FileGoneError(FILE_ID));
            const { retry_transcription } = toolsOf(ctx);

            const result = await call(retry_transcription, { fileId: FILE_ID });

            expect(result.restarted).toBe(false);
            expect(String(result.error)).toMatch(/удалена.*загрузи/i);
        });

        it('explains that only a failed transcript can be retried', async () => {
            deps.retryTranscription.execute.mockRejectedValue(
                new MeetingTranscriptNotRetryableError('status is completed'),
            );
            const { retry_transcription } = toolsOf(ctx);

            const result = await call(retry_transcription, { fileId: FILE_ID });

            expect(String(result.error)).toMatch(/только после сбоя|не нужен/);
        });

        it('says "not found" for a transcript of another user', async () => {
            deps.retryTranscription.execute.mockRejectedValue(
                new MeetingTranscriptNotFoundError(FILE_ID),
            );
            const { retry_transcription } = toolsOf(ctx);

            const result = await call(retry_transcription, { fileId: FILE_ID });

            expect(String(result.error)).toMatch(/не найдена/);
        });
    });

    it('does not swallow unknown failures', async () => {
        deps.getTranscript.execute.mockRejectedValue(new Error('db is down'));
        const { get_meeting_transcript } = toolsOf(ctx);

        await expect(get_meeting_transcript.invoke({ fileId: FILE_ID })).rejects.toThrow(
            'db is down',
        );
    });
});

describe('meetings agent prompt', () => {
    const prompt = buildMeetingsAgentPrompt();

    it('names every tool', () => {
        for (const name of [
            'get_meeting_transcript',
            'get_speaker_samples',
            'rename_speakers',
            'extract_meeting_tasks',
            'retry_transcription',
        ]) {
            expect(prompt).toContain(name);
        }
    });

    it('takes the recording from the attachments of the chat', () => {
        expect(prompt).toContain('[Вложения]');
        expect(prompt).toMatch(/recording/);
    });

    it('offers the next step as one question and acts only after consent', () => {
        expect(prompt).toMatch(/извлечь задачи/i);
        expect(prompt).toMatch(/создать (их|задачи) в системе/i);
        expect(prompt).toMatch(/одним вопросом/i);
        expect(prompt).toMatch(/только после согласия/i);
        expect(prompt).toMatch(/отказ/i);
    });

    it('forbids changing the text of replicas', () => {
        expect(prompt).toMatch(/не меняй текст реплик/i);
    });

    it('asks back on ambiguity instead of guessing', () => {
        expect(prompt).toMatch(/неоднозначн/i);
        expect(prompt).toMatch(/переспроси/i);
        expect(prompt).toMatch(/не угадывай/i);
    });

    it('never creates tasks itself and keeps the full task list with the evidence in the answer', () => {
        expect(prompt).toMatch(/сам задачи не создаёшь/i);
        expect(prompt).toMatch(/основани/i);
    });

    it('answers "not found" for a foreign transcript and does not invent', () => {
        expect(prompt).toMatch(/не найдена/i);
        expect(prompt).toMatch(/не придумывай/i);
    });
});
