import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTransactionRunner } from '../../../../database/postgres/testing/in-memory-transaction-runner';
import type { DomainEvent } from '../../../../shared/ddd';
import { DomainEventPublisherPort } from '../../../../shared/ddd';
import { OpenFileForProcessingUseCase } from '../../../files/application/open-file-for-processing.use-case';
import { ReleaseFileHoldUseCase } from '../../../files/application/release-file-hold.use-case';
import {
    FakeClock,
    InMemoryObjectStorage,
    InMemoryStoredFileRepository,
    silentLogger,
    testRetentionPolicy,
} from '../../../files/application/test-doubles';
import { recordingLogger } from '../../application/test-doubles';
import { TranscribeMeetingUseCase } from '../application/transcribe-meeting.use-case';
import { TranscriptionPermanentError, TranscriptionTemporaryError } from '../domain/errors';
import { MeetingTranscriptCompletedEvent } from '../domain/events/meeting-transcript-completed.event';
import { MeetingTranscript } from '../domain/meeting-transcript';
import {
    MeetingAudioPreparerPort,
    type PreparedMeetingAudio,
} from '../domain/ports/meeting-audio-preparer.port';
import { WholeFileSttPort, type WholeFileTranscription } from '../domain/ports/whole-file-stt.port';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import { InMemoryTranscriptSegmentRepository } from '../testing/in-memory-transcript-segment.repository';
import { WholeFileMeetingTranscriber } from './whole-file-meeting-transcriber';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const MAX_DURATION_SEC = 14400;

class Preparer extends MeetingAudioPreparerPort {
    durationSec = 3600;

    async prepare(inputPath: string, workDir: string): Promise<PreparedMeetingAudio> {
        // Как настоящий адаптер: длительность проверяется до отправки в провайдер.
        if (this.durationSec > MAX_DURATION_SEC) {
            throw new TranscriptionPermanentError('too-long', 'Recording is too long');
        }
        const path = join(workDir, 'meeting.ogg');
        await writeFile(path, 'prepared');
        return { path, durationSec: this.durationSec, sizeBytes: 8 };
    }
}

class Stt extends WholeFileSttPort {
    calls = 0;
    failures: Error[] = [];

    transcribe(audio: PreparedMeetingAudio): Promise<WholeFileTranscription> {
        this.calls += 1;
        const failure = this.failures.shift();
        if (failure) return Promise.reject(failure);
        const end = audio.durationSec;
        return Promise.resolve({
            language: 'ru',
            words: [
                { type: 'word', text: 'Привет', start: 0, end: 1, speakerId: 'a' },
                { type: 'word', text: 'Ответ', start: end - 2, end: end - 1, speakerId: 'b' },
            ],
        });
    }
}

describe('whole-file meeting flow', () => {
    let root: string;
    let preparer: Preparer;
    let stt: Stt;
    let transcripts: InMemoryMeetingTranscriptRepository;
    let segments: InMemoryTranscriptSegmentRepository;
    let published: DomainEvent[];
    let useCase: TranscribeMeetingUseCase;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'whole-flow-root-'));
        preparer = new Preparer();
        stt = new Stt();
        const transactions = new InMemoryTransactionRunner();
        transcripts = new InMemoryMeetingTranscriptRepository();
        transcripts.transactions = transactions;
        segments = new InMemoryTranscriptSegmentRepository(transactions);
        published = [];
        const events = new (class extends DomainEventPublisherPort {
            publish(batch: readonly DomainEvent[]): Promise<void> {
                published.push(...batch);
                return Promise.resolve();
            }
        })();
        const files = new InMemoryStoredFileRepository();
        const open = new OpenFileForProcessingUseCase(
            files,
            new InMemoryObjectStorage(),
            silentLogger(),
        );
        vi.spyOn(open, 'execute').mockImplementation(() =>
            Promise.resolve({
                stream: Readable.from([Buffer.from('audio')]),
                contentType: 'audio/ogg',
                sizeBytes: 5,
            }),
        );
        const release = new ReleaseFileHoldUseCase(
            files,
            testRetentionPolicy(),
            new FakeClock(),
            transactions,
        );
        vi.spyOn(release, 'execute').mockResolvedValue(undefined);
        useCase = new TranscribeMeetingUseCase(
            transcripts,
            segments,
            new WholeFileMeetingTranscriber(preparer, stt, { tmpRoot: root }),
            open,
            release,
            transactions,
            events,
            recordingLogger().logger,
        );
        await transcripts.insertPendingIfAbsent(
            MeetingTranscript.createPending({
                fileId: FILE_ID,
                ownerId: 'owner-1',
                now: new Date(),
            }),
        );
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    const stored = async (): Promise<MeetingTranscript> => {
        const transcript = await transcripts.findByFileId(FILE_ID);
        if (transcript === null) throw new Error('transcript is missing');
        return transcript;
    };

    it.each([
        ['short', 120],
        ['long', 14400],
    ])('sends a valid %s recording once and keeps absolute timings', async (_name, durationSec) => {
        preparer.durationSec = durationSec;

        await useCase.execute({ fileId: FILE_ID, isFinalAttempt: false });

        expect(stt.calls).toBe(1);
        expect((await stored()).status).toBe('completed');
        const saved = await segments.readAll(FILE_ID);
        expect(saved).toHaveLength(2);
        expect(saved[1]?.endSec).toBe(durationSec - 1);
        expect(published[0]).toBeInstanceOf(MeetingTranscriptCompletedEvent);
        expect(await readdir(root)).toEqual([]);
    });

    it('fails too-long before the provider is called', async () => {
        preparer.durationSec = MAX_DURATION_SEC + 1;

        await expect(
            useCase.execute({ fileId: FILE_ID, isFinalAttempt: false }),
        ).rejects.toBeInstanceOf(TranscriptionPermanentError);

        expect(stt.calls).toBe(0);
        const transcript = await stored();
        expect(transcript.status).toBe('failed');
        expect(transcript.failureReason).toBe('too-long');
        expect(await segments.readAll(FILE_ID)).toEqual([]);
    });

    it('retries a temporary provider error and completes on the next attempt', async () => {
        stt.failures = [new TranscriptionTemporaryError('503')];

        await expect(
            useCase.execute({ fileId: FILE_ID, isFinalAttempt: false }),
        ).rejects.toBeInstanceOf(TranscriptionTemporaryError);
        expect((await stored()).status).toBe('processing');

        await useCase.execute({ fileId: FILE_ID, isFinalAttempt: true });

        expect(stt.calls).toBe(2);
        expect((await stored()).status).toBe('completed');
        expect(await segments.readAll(FILE_ID)).toHaveLength(2);
    });

    it('ends in provider-unavailable on the final temporary failure', async () => {
        stt.failures = [new TranscriptionTemporaryError('503')];

        await useCase.execute({ fileId: FILE_ID, isFinalAttempt: true }).catch(() => undefined);

        const transcript = await stored();
        expect(transcript.status).toBe('failed');
        expect(transcript.failureReason).toBe('provider-unavailable');
    });
});
