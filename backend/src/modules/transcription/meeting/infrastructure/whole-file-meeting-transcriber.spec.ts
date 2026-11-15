import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TranscriptionPermanentError, TranscriptionTemporaryError } from '../domain/errors';
import {
    MeetingAudioPreparerPort,
    type PreparedMeetingAudio,
} from '../domain/ports/meeting-audio-preparer.port';
import type { MeetingAudio } from '../domain/ports/meeting-transcriber.port';
import {
    WholeFileSttPort,
    type WholeFileTranscription,
    type WholeFileWord,
} from '../domain/ports/whole-file-stt.port';
import { WholeFileMeetingTranscriber } from './whole-file-meeting-transcriber';

const AUDIO = Buffer.from('fake-recording-bytes');

const word = (text: string, start: number, end: number, speakerId: string): WholeFileWord => ({
    type: 'word',
    text,
    start,
    end,
    speakerId,
});

class FakePreparer extends MeetingAudioPreparerPort {
    readonly calls: { input: string; workDir: string; signal: AbortSignal }[] = [];
    inputs: string[] = [];
    durationSec = 3600;
    error: Error | null = null;

    async prepare(
        inputPath: string,
        workDir: string,
        signal: AbortSignal,
    ): Promise<PreparedMeetingAudio> {
        this.calls.push({ input: inputPath, workDir, signal });
        this.inputs.push(await readFile(inputPath, 'utf8'));
        if (this.error) throw this.error;
        const path = join(workDir, 'meeting.ogg');
        await writeFile(path, 'prepared');
        return { path, durationSec: this.durationSec, sizeBytes: 8 };
    }
}

class FakeStt extends WholeFileSttPort {
    readonly calls: { audio: PreparedMeetingAudio; signal: AbortSignal }[] = [];
    answer: WholeFileTranscription = {
        language: 'ru',
        words: [word('привет', 0.5, 1, 'speaker_0'), word('мир', 3500, 3501, 'speaker_1')],
    };
    error: Error | null = null;
    onCall: (() => void) | null = null;

    transcribe(audio: PreparedMeetingAudio, signal: AbortSignal): Promise<WholeFileTranscription> {
        this.calls.push({ audio, signal });
        this.onCall?.();
        if (this.error) return Promise.reject(this.error);
        return Promise.resolve(this.answer);
    }
}

describe('WholeFileMeetingTranscriber', () => {
    let tmpRoot: string;
    let preparer: FakePreparer;
    let stt: FakeStt;

    const audio = (): MeetingAudio => ({
        stream: Readable.from([AUDIO]),
        contentType: 'audio/mp4',
        sizeBytes: AUDIO.length,
    });
    const make = (root = tmpRoot): WholeFileMeetingTranscriber =>
        new WholeFileMeetingTranscriber(preparer, stt, { tmpRoot: root });

    beforeEach(async () => {
        tmpRoot = await mkdtemp(join(tmpdir(), 'whole-file-transcriber-spec-'));
        preparer = new FakePreparer();
        stt = new FakeStt();
    });

    afterEach(async () => {
        await rm(tmpRoot, { recursive: true, force: true });
    });

    it('writes the stream to a temporary folder, prepares once and calls STT once', async () => {
        await make().transcribe(audio(), new AbortController().signal);

        expect(preparer.inputs).toEqual([AUDIO.toString('utf8')]);
        expect(preparer.calls).toHaveLength(1);
        expect(preparer.calls[0].workDir.startsWith(tmpRoot)).toBe(true);
        expect(stt.calls).toHaveLength(1);
        expect(stt.calls[0].audio.path.startsWith(preparer.calls[0].workDir)).toBe(true);
    });

    it('passes the abort signal to preparation and STT', async () => {
        const signal = new AbortController().signal;

        await make().transcribe(audio(), signal);

        expect(preparer.calls[0].signal).toBe(signal);
        expect(stt.calls[0].signal).toBe(signal);
    });

    it('keeps timecodes of the whole recording without offsets', async () => {
        const { transcript } = await make().transcribe(audio(), new AbortController().signal);

        expect(transcript.language).toBe('ru');
        expect(transcript.durationSec).toBe(3600);
        expect(transcript.segments.map((s) => [s.speaker, s.startSec, s.endSec])).toEqual([
            [1, 0.5, 1],
            [2, 3500, 3501],
        ]);
    });

    it('returns no_speech as empty segments', async () => {
        stt.answer = { language: 'ru', words: [] };

        const { transcript } = await make().transcribe(audio(), new AbortController().signal);

        expect(transcript.segments).toEqual([]);
    });

    it('takes usage from the provider and keeps unknown cost as null', async () => {
        stt.answer = { ...stt.answer, usage: { seconds: 3600, cost: 0.4 } };
        expect((await make().transcribe(audio(), new AbortController().signal)).usage).toEqual({
            seconds: 3600,
            cost: 0.4,
        });

        stt.answer = { language: 'ru', words: [word('a', 0, 1, 's')] };
        expect((await make().transcribe(audio(), new AbortController().signal)).usage).toEqual({
            seconds: 3600,
            cost: null,
        });
    });

    it('removes the temporary folder after success', async () => {
        await make().transcribe(audio(), new AbortController().signal);

        expect(await readdir(tmpRoot)).toEqual([]);
    });

    it('removes the folder and does not call STT when preparation fails', async () => {
        preparer.error = new TranscriptionPermanentError('too-long');

        await expect(
            make().transcribe(audio(), new AbortController().signal),
        ).rejects.toMatchObject({ reason: 'too-long' });
        expect(stt.calls).toHaveLength(0);
        expect(await readdir(tmpRoot)).toEqual([]);
    });

    it('removes the folder when STT fails and rethrows the error', async () => {
        stt.error = new TranscriptionTemporaryError('503');

        await expect(
            make().transcribe(audio(), new AbortController().signal),
        ).rejects.toBeInstanceOf(TranscriptionTemporaryError);
        expect(await readdir(tmpRoot)).toEqual([]);
    });

    it('removes the folder when the request is aborted', async () => {
        const controller = new AbortController();
        stt.onCall = (): void => {
            controller.abort();
        };
        stt.error = new Error('aborted');

        await expect(make().transcribe(audio(), controller.signal)).rejects.toThrow();
        expect(await readdir(tmpRoot)).toEqual([]);
    });

    it('removes the folder when the stream is aborted before download', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(make().transcribe(audio(), controller.signal)).rejects.toThrow();
        expect(stt.calls).toHaveLength(0);
        expect(await readdir(tmpRoot)).toEqual([]);
    });

    it('turns a storage read failure into a temporary error', async () => {
        const stream = new Readable({
            read(): void {
                this.destroy(new Error('s3 reset'));
            },
        });

        await expect(
            make().transcribe(
                { stream, contentType: 'audio/mp4', sizeBytes: 1 },
                new AbortController().signal,
            ),
        ).rejects.toBeInstanceOf(TranscriptionTemporaryError);
        expect(await readdir(tmpRoot)).toEqual([]);
    });

    it('destroys the recording stream when the temporary folder cannot be created', async () => {
        const recording = audio();

        await expect(
            make(join(tmpRoot, 'missing', 'nested')).transcribe(
                recording,
                new AbortController().signal,
            ),
        ).rejects.toThrow();
        expect(recording.stream.destroyed).toBe(true);
    });

    it('removes stale work folders on start and keeps fresh and foreign ones', async () => {
        const stale = join(tmpRoot, 'meeting-transcription-stale');
        const fresh = join(tmpRoot, 'meeting-transcription-fresh');
        const foreign = join(tmpRoot, 'other-stale');
        for (const dir of [stale, fresh, foreign]) await mkdir(dir);
        const longAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        await utimes(stale, longAgo, longAgo);
        await utimes(foreign, longAgo, longAgo);

        await make().onModuleInit();

        expect((await readdir(tmpRoot)).sort()).toEqual([
            'meeting-transcription-fresh',
            'other-stale',
        ]);
    });

    it('does not fail start when the temporary root cannot be read', async () => {
        await expect(make(join(tmpRoot, 'missing')).onModuleInit()).resolves.toBeUndefined();
    });

    it('does not use the legacy chunked pipeline', async () => {
        const source = await readFile(
            join(__dirname, 'whole-file-meeting-transcriber.ts'),
            'utf8',
        ).catch(() => '');

        expect(source).not.toMatch(
            /SpeakerRegistry|TranscriptMerger|planChunks|AudioChunkerPort|ChunkTranscriberPort/,
        );
    });
});
