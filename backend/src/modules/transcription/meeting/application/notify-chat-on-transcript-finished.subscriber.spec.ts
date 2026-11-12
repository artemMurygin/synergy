import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTransactionRunner } from '../../../../database/postgres/testing/in-memory-transaction-runner';
import { recordingLogger } from '../../application/test-doubles';
import { FileUploadedEvent } from '../../../files/domain/events/file-uploaded.event';
import { DiarizedTranscript } from '../domain/diarized-transcript';
import {
    MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE,
    MeetingTranscriptCompletedEvent,
} from '../domain/events/meeting-transcript-completed.event';
import {
    MEETING_TRANSCRIPT_FAILED_EVENT_TYPE,
    MeetingTranscriptFailedEvent,
} from '../domain/events/meeting-transcript-failed.event';
import { MeetingTranscript } from '../domain/meeting-transcript';
import {
    MeetingChatPort,
    type MeetingChatMessage,
    type RecordingOfOwner,
} from '../domain/ports/meeting-chat.port';
import { TranscriptSegment } from '../domain/transcript-segment';
import type { TranscriptionFailureReason } from '../domain/transcription-status';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import { InMemoryTranscriptSegmentRepository } from '../testing/in-memory-transcript-segment.repository';
import {
    FakeDocumentRenderer,
    recordingFiles,
    storeGeneratedFileDouble,
    type RecordingFilesFixture,
    type StoreGeneratedFileDouble,
} from '../testing/meeting-document-doubles';
import { MeetingDocuments } from './meeting-documents';
import {
    NOTIFY_CHAT_ON_TRANSCRIPT_SUBSCRIBERS,
    NotifyChatOnTranscriptFinished,
    type NotifyChatOnTranscriptFinishedSettings,
    UnexpectedTranscriptEventError,
} from './notify-chat-on-transcript-finished.subscriber';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const OWNER_ID = 'owner-1';
const CHAT_ID = 'chat-1';
const RECORDING = 'встреча-12-ноя.m4a';
const UPLOADED_AT = new Date('2026-11-12T08:00:00Z');
const T0 = new Date('2026-11-12T08:01:00Z');
const T1 = new Date('2026-11-12T09:00:00Z');
const metadata = { timestamp: T1.getTime(), userId: OWNER_ID };

const SEGMENTS = [
    TranscriptSegment.of({ seq: 0, speaker: 1, startSec: 0, endSec: 5, text: 'Добрый день' }),
    TranscriptSegment.of({ seq: 1, speaker: 2, startSec: 5, endSec: 9, text: 'Начнём' }),
    TranscriptSegment.of({ seq: 2, speaker: 3, startSec: 9, endSec: 4360, text: 'Хорошо' }),
];

class FakeMeetingChat extends MeetingChatPort {
    readonly chats = new Map<string, string>();
    readonly posted: MeetingChatMessage[] = [];
    readonly lookups: RecordingOfOwner[] = [];

    findChatOfRecording(input: RecordingOfOwner): Promise<string | null> {
        this.lookups.push(input);
        return Promise.resolve(this.chats.get(`${input.ownerId}/${input.fileId}`) ?? null);
    }

    post(message: MeetingChatMessage): Promise<void> {
        this.posted.push(message);
        return Promise.resolve();
    }

    only(): MeetingChatMessage {
        expect(this.posted).toHaveLength(1);
        return this.posted[0];
    }
}

function completedEvent(
    status: 'completed' | 'no_speech' = 'completed',
    id = 'event-1',
): MeetingTranscriptCompletedEvent {
    return new MeetingTranscriptCompletedEvent({
        id,
        aggregateId: FILE_ID,
        ownerId: OWNER_ID,
        status,
        metadata,
    });
}

function failedEvent(
    reason: TranscriptionFailureReason,
    id = 'event-2',
): MeetingTranscriptFailedEvent {
    return new MeetingTranscriptFailedEvent({
        id,
        aggregateId: FILE_ID,
        ownerId: OWNER_ID,
        reason,
        metadata,
    });
}

describe('NotifyChatOnTranscriptFinished', () => {
    let transcripts: InMemoryMeetingTranscriptRepository;
    let segments: InMemoryTranscriptSegmentRepository;
    let renderer: FakeDocumentRenderer;
    let store: StoreGeneratedFileDouble;
    let recordings: RecordingFilesFixture;
    let chat: FakeMeetingChat;
    let subscriber: NotifyChatOnTranscriptFinished;

    async function seed(
        outcome: 'completed' | 'no_speech' | TranscriptionFailureReason,
    ): Promise<void> {
        const t = MeetingTranscript.createPending({ fileId: FILE_ID, ownerId: OWNER_ID, now: T0 });
        t.start();
        if (outcome === 'completed') {
            t.complete(
                DiarizedTranscript.of({ language: 'ru', durationSec: 4360, segments: SEGMENTS }),
                T1,
            );
            await segments.insertAll(FILE_ID, SEGMENTS);
        } else if (outcome === 'no_speech') {
            t.complete(
                DiarizedTranscript.of({ language: null, durationSec: 30, segments: [] }),
                T1,
            );
        } else {
            t.fail(outcome, T1);
        }
        await transcripts.save(t);
    }

    function deleteRecording(): void {
        const file = recordings.files.byId.get(FILE_ID);
        if (file === undefined) throw new Error('recording is missing');
        file.markDeleted(T1, 'retention');
        file.pullDomainEvents();
    }

    beforeEach(() => {
        transcripts = new InMemoryMeetingTranscriptRepository();
        transcripts.transactions = new InMemoryTransactionRunner();
        segments = new InMemoryTranscriptSegmentRepository();
        renderer = new FakeDocumentRenderer();
        store = storeGeneratedFileDouble();
        recordings = recordingFiles();
        recordings.addRecording({
            id: FILE_ID,
            ownerId: OWNER_ID,
            name: RECORDING,
            uploadedAt: UPLOADED_AT,
        });
        chat = new FakeMeetingChat();
        chat.chats.set(`${OWNER_ID}/${FILE_ID}`, CHAT_ID);
        const documents = new MeetingDocuments(
            transcripts,
            segments,
            renderer,
            store.store,
            recordings.getFile,
            recordingLogger().logger,
        );
        const settings: NotifyChatOnTranscriptFinishedSettings = { maxRecordingSec: 4 * 3600 };
        subscriber = new NotifyChatOnTranscriptFinished(
            transcripts,
            documents,
            recordings.getFile,
            chat,
            settings,
            recordingLogger().logger,
        );
    });

    it('gives a stable non-transactional subscriber per event type', () => {
        const completed = subscriber.subscriberFor(MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE);
        const failed = subscriber.subscriberFor(MEETING_TRANSCRIPT_FAILED_EVENT_TYPE);

        expect(completed.name).toBe(NOTIFY_CHAT_ON_TRANSCRIPT_SUBSCRIBERS.completed);
        expect(failed.name).toBe(NOTIFY_CHAT_ON_TRANSCRIPT_SUBSCRIBERS.failed);
        expect(completed.name).not.toBe(failed.name);
        expect(completed.isTransactional).toBe(false);
        expect(failed.isTransactional).toBe(false);
    });

    it('handles the event through the subscriber of its type', async () => {
        await seed('no_speech');

        await subscriber
            .subscriberFor(MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE)
            .handle(completedEvent('no_speech'));

        expect(chat.only().dedupKey).toBe('event-1');
    });

    describe('completed', () => {
        it('posts the transcript document with the speaker count and duration', async () => {
            await seed('completed');

            await subscriber.handle(completedEvent());

            const message = chat.only();
            expect(message).toMatchObject({
                chatId: CHAT_ID,
                ownerId: OWNER_ID,
                topic: 'meeting-transcript.ready',
                recording: { fileId: FILE_ID, fileName: RECORDING },
            });
            expect(message.text).toBe(
                'Расшифровка готова: 3 спикера, 01:12:40. Напишите, кто есть кто, например: «Спикер 1 — Анна, Спикер 2 — Олег». Можно сразу перейти к задачам: напишите «извлеки задачи».',
            );
            expect(store.calls).toHaveLength(1);
            expect(store.calls[0].name).toBe('Расшифровка — встреча-12-ноя.docx');
            expect(message.attachments).toEqual(['generated-1']);
        });

        it.each([
            [1, 'спикер'],
            [2, 'спикера'],
            [5, 'спикеров'],
            [11, 'спикеров'],
            [21, 'спикер'],
            [22, 'спикера'],
        ])('names %i speakers as "%s"', async (count, word) => {
            const many = Array.from({ length: count }, (_, i) =>
                TranscriptSegment.of({
                    seq: i,
                    speaker: i + 1,
                    startSec: i,
                    endSec: i + 1,
                    text: `Реплика ${String(i)}`,
                }),
            );
            const t = MeetingTranscript.createPending({
                fileId: FILE_ID,
                ownerId: OWNER_ID,
                now: T0,
            });
            t.start();
            t.complete(
                DiarizedTranscript.of({ language: 'ru', durationSec: 65, segments: many }),
                T1,
            );
            await segments.insertAll(FILE_ID, many);
            await transcripts.save(t);

            await subscriber.handle(completedEvent());

            expect(chat.only().text).toContain(
                `Расшифровка готова: ${String(count)} ${word}, 00:01:05.`,
            );
        });
    });

    it('posts no_speech without a document and without offering a retry', async () => {
        await seed('no_speech');

        await subscriber.handle(completedEvent('no_speech'));

        const message = chat.only();
        expect(message.text).toBe(
            `В записи ${RECORDING} не удалось найти речь. Проверьте, что это нужный файл, и загрузите его снова.`,
        );
        expect(message.text).not.toMatch(/попробуй ещё раз/);
        expect(message.attachments).toEqual([]);
        expect(message.topic).toBe('meeting-transcript.ready');
        expect(store.calls).toHaveLength(0);
    });

    describe('failed', () => {
        it.each([
            [
                'provider-unavailable',
                `Не удалось расшифровать ${RECORDING}: сервис распознавания сейчас недоступен. Напишите «попробуй ещё раз», и я повторю.`,
            ],
            [
                'timeout',
                `Не удалось расшифровать ${RECORDING}: обработка заняла слишком много времени. Напишите «попробуй ещё раз», и я повторю.`,
            ],
            [
                'too-long',
                `Запись ${RECORDING} длиннее 4 часов, такие пока не поддерживаются. Разделите её на части и загрузите по очереди.`,
            ],
            [
                'unsupported-media',
                `Не удалось прочитать запись ${RECORDING}. Загрузите другой файл, например mp3 или m4a.`,
            ],
        ] as const)('explains %s while the recording is stored', async (reason, text) => {
            await seed(reason);

            await subscriber.handle(failedEvent(reason));

            const message = chat.only();
            expect(message.text).toBe(text);
            expect(message.topic).toBe('meeting-transcript.failed');
            expect(message.attachments).toEqual([]);
            expect(message.recording).toEqual({ fileId: FILE_ID, fileName: RECORDING });
        });

        it.each([
            [
                'provider-unavailable',
                `Не удалось расшифровать ${RECORDING}: сервис распознавания сейчас недоступен. Запись уже удалена, загрузите её заново.`,
            ],
            [
                'timeout',
                `Не удалось расшифровать ${RECORDING}: обработка заняла слишком много времени. Запись уже удалена, загрузите её заново.`,
            ],
        ] as const)(
            'offers to upload again instead of a retry for %s when the recording is deleted',
            async (reason, text) => {
                await seed(reason);
                deleteRecording();

                await subscriber.handle(failedEvent(reason));

                expect(chat.only().text).toBe(text);
            },
        );

        it.each(['too-long', 'unsupported-media'] as const)(
            'never offers a retry for %s',
            async (reason) => {
                await seed(reason);

                await subscriber.handle(failedEvent(reason));

                expect(chat.only().text).not.toMatch(/попробуй ещё раз|повторю/);
            },
        );

        it('names the maximum from the settings', async () => {
            await seed('too-long');
            const documents = new MeetingDocuments(
                transcripts,
                segments,
                renderer,
                store.store,
                recordings.getFile,
                recordingLogger().logger,
            );
            const custom = new NotifyChatOnTranscriptFinished(
                transcripts,
                documents,
                recordings.getFile,
                chat,
                { maxRecordingSec: 3600 },
                recordingLogger().logger,
            );

            await custom.handle(failedEvent('too-long'));

            expect(chat.only().text).toContain('длиннее 1 часа');
        });

        it('does nothing when the owner deleted the recording (file-deleted)', async () => {
            await seed('file-deleted');

            await subscriber.handle(failedEvent('file-deleted'));

            expect(chat.posted).toEqual([]);
            expect(chat.lookups).toEqual([]);
        });
    });

    it('does nothing for a recording that was never sent to a chat', async () => {
        await seed('completed');
        chat.chats.clear();

        await subscriber.handle(completedEvent());

        expect(chat.lookups).toEqual([{ ownerId: OWNER_ID, fileId: FILE_ID }]);
        expect(chat.posted).toEqual([]);
        expect(store.calls).toHaveLength(0);
    });

    it('uses the event id as the dedup key', async () => {
        await seed('completed');

        await subscriber.handle(completedEvent('completed', 'event-42'));
        await subscriber.handle(failedEvent('provider-unavailable', 'event-43'));

        expect(chat.posted.map((m) => m.dedupKey)).toEqual(['event-42', 'event-43']);
    });

    it('rejects an unexpected event', async () => {
        const uploaded = new FileUploadedEvent({
            aggregateId: FILE_ID,
            ownerId: OWNER_ID,
            kind: 'recording',
            mediaType: 'audio/mpeg',
            sizeBytes: 1,
            metadata,
        });

        await expect(subscriber.handle(uploaded)).rejects.toBeInstanceOf(
            UnexpectedTranscriptEventError,
        );
    });
});
