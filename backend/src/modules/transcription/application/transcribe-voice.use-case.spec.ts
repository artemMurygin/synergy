import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionResult } from '../domain/transcription-result';
import { VoiceClip } from '../domain/voice-clip';
import { FakeTranscriber, recordingLogger, type RecordingLogger } from './test-doubles';
import {
    MAX_VOICE_DURATION_SEC,
    MAX_VOICE_SIZE_BYTES,
    TRANSCRIPTION_TIMEOUT_MS,
    TranscribeVoiceUseCase,
} from './transcribe-voice.use-case';

const SPOKEN = 'Поставь Ивану задачу позвонить клиенту завтра';
const AUDIO_MARKER = 'OggS-secret-audio-marker';
const AUDIO = Buffer.from(AUDIO_MARKER);
const MB = 1024 * 1024;

function clip(
    overrides: { durationSec?: number; audio?: Buffer; mimeType?: string } = {},
): VoiceClip {
    return VoiceClip.of({
        audio: overrides.audio ?? AUDIO,
        mimeType: overrides.mimeType ?? 'audio/ogg',
        durationSec: overrides.durationSec ?? 20,
    });
}

function setup(transcriber: FakeTranscriber): {
    useCase: TranscribeVoiceUseCase;
    log: RecordingLogger;
} {
    const log = recordingLogger();
    const useCase = new TranscribeVoiceUseCase(transcriber, log.logger);
    return { useCase, log };
}

function expectNothingSensitiveLogged(dump: string): void {
    expect(dump).not.toContain(SPOKEN);
    expect(dump).not.toContain(AUDIO_MARKER);
    expect(dump).not.toContain(AUDIO.toString('base64'));
}

describe('TranscribeVoiceUseCase', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('has the limits of the spec: 3 minutes, 5 MB, 30 seconds', () => {
        expect(MAX_VOICE_DURATION_SEC).toBe(180);
        expect(MAX_VOICE_SIZE_BYTES).toBe(5 * MB);
        expect(TRANSCRIPTION_TIMEOUT_MS).toBe(30_000);
    });

    it('returns the transcript of the provider', async () => {
        const transcriber = FakeTranscriber.answering(TranscriptionResult.text(SPOKEN));
        const { useCase, log } = setup(transcriber);

        const result = await useCase.execute(clip());

        expect(result).toEqual({ kind: 'text', text: SPOKEN });
        expect(transcriber.calls).toHaveLength(1);
        expect(transcriber.calls[0]?.clip.durationSec).toBe(20);
        expectNothingSensitiveLogged(log.dump());
    });

    it('returns no-speech when the provider found no speech', async () => {
        const { useCase } = setup(FakeTranscriber.answering(TranscriptionResult.noSpeech()));

        await expect(useCase.execute(clip())).resolves.toEqual({ kind: 'no-speech' });
    });

    it('accepts a clip of exactly 3 minutes and 5 MB', async () => {
        const transcriber = FakeTranscriber.answering(TranscriptionResult.text(SPOKEN));
        const { useCase } = setup(transcriber);

        const result = await useCase.execute(
            clip({ durationSec: MAX_VOICE_DURATION_SEC, audio: Buffer.alloc(5 * MB, 1) }),
        );

        expect(result.kind).toBe('text');
    });

    it('rejects a clip longer than 3 minutes without calling the provider', async () => {
        const transcriber = FakeTranscriber.answering(TranscriptionResult.text(SPOKEN));
        const { useCase } = setup(transcriber);

        const result = await useCase.execute(clip({ durationSec: 240 }));

        expect(result).toEqual({ kind: 'rejected', reason: 'too-long' });
        expect(transcriber.calls).toHaveLength(0);
    });

    it('rejects a clip larger than 5 MB without calling the provider', async () => {
        const transcriber = FakeTranscriber.answering(TranscriptionResult.text(SPOKEN));
        const { useCase } = setup(transcriber);

        const result = await useCase.execute(clip({ audio: Buffer.alloc(5 * MB + 1, 1) }));

        expect(result).toEqual({ kind: 'rejected', reason: 'too-large' });
        expect(transcriber.calls).toHaveLength(0);
    });

    it('rejects a file that is not a supported audio format without calling the provider', async () => {
        const transcriber = FakeTranscriber.answering(TranscriptionResult.text(SPOKEN));
        const { useCase } = setup(transcriber);

        const result = await useCase.execute(clip({ mimeType: 'image/jpeg' }));

        expect(result).toEqual({ kind: 'rejected', reason: 'unsupported-format' });
        expect(transcriber.calls).toHaveLength(0);
    });

    it('turns a provider failure into provider-unavailable and logs no text or audio', async () => {
        const failure = new Error(`provider exploded while reading ${AUDIO_MARKER}: ${SPOKEN}`);
        const { useCase, log } = setup(FakeTranscriber.failing(failure));

        const result = await useCase.execute(clip());

        expect(result).toEqual({ kind: 'rejected', reason: 'provider-unavailable' });
        expect(log.warn).toHaveBeenCalled();
        const dump = log.dump();
        expect(dump).toContain('"durationSec":20');
        expectNothingSensitiveLogged(dump);
    });

    it('gives up after 30 seconds, aborts the provider call and returns provider-unavailable', async () => {
        vi.useFakeTimers();
        const transcriber = FakeTranscriber.hanging();
        const { useCase, log } = setup(transcriber);

        const pending = useCase.execute(clip());
        await vi.advanceTimersByTimeAsync(TRANSCRIPTION_TIMEOUT_MS - 1);
        expect(transcriber.calls[0]?.signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);

        await expect(pending).resolves.toEqual({
            kind: 'rejected',
            reason: 'provider-unavailable',
        });
        expect(transcriber.calls[0]?.signal.aborted).toBe(true);
        expect(log.dump()).toContain('timeout');
    });

    it('aborts the provider call when the caller cancels and logs the cancellation', async () => {
        const transcriber = FakeTranscriber.hanging();
        const { useCase, log } = setup(transcriber);
        const cancel = new AbortController();

        const pending = useCase.execute(clip(), cancel.signal);
        await Promise.resolve();
        cancel.abort();

        await expect(pending).resolves.toEqual({
            kind: 'rejected',
            reason: 'provider-unavailable',
        });
        expect(transcriber.calls[0]?.signal.aborted).toBe(true);
        expect(log.warn).not.toHaveBeenCalled();
        expect(log.dump()).toContain('"outcome":"cancelled"');
    });

    it('does not call the provider when already cancelled', async () => {
        const transcriber = FakeTranscriber.answering(TranscriptionResult.text(SPOKEN));
        const { useCase } = setup(transcriber);

        const result = await useCase.execute(clip(), AbortSignal.abort());

        expect(result).toEqual({ kind: 'rejected', reason: 'provider-unavailable' });
        expect(transcriber.calls).toHaveLength(0);
    });

    it('logs a provider failure under err without its message', async () => {
        const failure = new Error(`provider said: ${SPOKEN}`);
        const { useCase, log } = setup(FakeTranscriber.failing(failure));

        await useCase.execute(clip());

        expect(log.warn).toHaveBeenCalledWith(
            expect.objectContaining({ err: { type: 'Error' } }),
            'Voice transcription failed',
        );
    });

    it('logs the duration, the size and the outcome of every attempt, never the text', async () => {
        const { useCase, log } = setup(FakeTranscriber.answering(TranscriptionResult.text(SPOKEN)));

        await useCase.execute(clip());

        const dump = log.dump();
        expect(dump).toContain('"durationSec":20');
        expect(dump).toContain(`"sizeBytes":${String(AUDIO.byteLength)}`);
        expect(dump).toContain('"outcome":"text"');
        expectNothingSensitiveLogged(dump);
    });
});
