import { describe, expect, it, vi } from 'vitest';
import { UnsupportedVoiceAudioError, VoiceAudioUnavailableError } from '../domain/errors';
import type { NormalizedVoiceAudio } from '../domain/normalized-voice-audio';
import { VoiceAudioNormalizerPort } from '../domain/ports/voice-audio-normalizer.port';
import {
    VoiceRateLimiterPort,
    type VoiceRateDecision,
} from '../domain/ports/voice-rate-limiter.port';
import { TranscriptionResult } from '../domain/transcription-result';
import { FakeTranscriber, recordingLogger, type RecordingLogger } from './test-doubles';
import { TranscribeUploadedVoiceUseCase } from './transcribe-uploaded-voice.use-case';
import { TranscribeVoiceUseCase } from './transcribe-voice.use-case';

class FakeNormalizer extends VoiceAudioNormalizerPort {
    calls: { audio: Buffer; mimeType: string; signal: AbortSignal }[] = [];
    constructor(private readonly behaviour: () => Promise<NormalizedVoiceAudio>) {
        super();
    }
    normalize(audio: Buffer, mimeType: string, signal: AbortSignal): Promise<NormalizedVoiceAudio> {
        this.calls.push({ audio, mimeType, signal });
        return this.behaviour();
    }
}

class FakeLimiter extends VoiceRateLimiterPort {
    users: string[] = [];
    constructor(private readonly decision: VoiceRateDecision) {
        super();
    }
    acquire(userId: string): Promise<VoiceRateDecision> {
        this.users.push(userId);
        return Promise.resolve(this.decision);
    }
}

const ALLOWED = { allowed: true, retryAfterSec: 0 };
const normalized = (durationSec: number): NormalizedVoiceAudio => ({
    audio: Buffer.from('ogg-bytes'),
    mimeType: 'audio/ogg',
    durationSec,
});

interface Setup {
    useCase: TranscribeUploadedVoiceUseCase;
    normalizer: FakeNormalizer;
    transcriber: FakeTranscriber;
    log: RecordingLogger;
}

function setup(options: {
    limiter?: VoiceRateLimiterPort;
    normalizer?: FakeNormalizer;
    transcriber?: FakeTranscriber;
}): Setup {
    const log = recordingLogger();
    const normalizer =
        options.normalizer ?? new FakeNormalizer(() => Promise.resolve(normalized(5)));
    const transcriber =
        options.transcriber ?? FakeTranscriber.answering(TranscriptionResult.text('привет'));
    const limiter = options.limiter ?? new FakeLimiter(ALLOWED);
    const useCase = new TranscribeUploadedVoiceUseCase(
        limiter,
        normalizer,
        new TranscribeVoiceUseCase(transcriber, log.logger),
        log.logger,
    );
    return { useCase, normalizer, transcriber, log };
}

const upload = {
    userId: 'user-1',
    audio: Buffer.from('webm-secret-bytes'),
    mimeType: 'audio/webm',
};
const idle = new AbortController().signal;

describe('TranscribeUploadedVoiceUseCase', () => {
    it('transcribes the normalized audio with the server duration', async () => {
        const { useCase, transcriber, normalizer } = setup({
            normalizer: new FakeNormalizer(() => Promise.resolve(normalized(7.5))),
        });
        const result = await useCase.execute(upload, idle);
        expect(result).toEqual({ kind: 'text', text: 'привет' });
        expect(normalizer.calls[0]?.mimeType).toBe('audio/webm');
        expect(transcriber.calls[0]?.clip.durationSec).toBe(7.5);
        expect(transcriber.calls[0]?.clip.mimeType).toBe('audio/ogg');
    });

    it('rejects a 4 minute recording as too-long without calling the provider', async () => {
        const { useCase, transcriber } = setup({
            normalizer: new FakeNormalizer(() => Promise.resolve(normalized(240))),
        });
        expect(await useCase.execute(upload, idle)).toEqual({
            kind: 'rejected',
            reason: 'too-long',
        });
        expect(transcriber.calls).toHaveLength(0);
    });

    it('returns rate-limited without normalizing', async () => {
        const { useCase, normalizer, transcriber } = setup({
            limiter: new FakeLimiter({ allowed: false, retryAfterSec: 42 }),
        });
        expect(await useCase.execute(upload, idle)).toEqual({
            kind: 'rate-limited',
            retryAfterSec: 42,
        });
        expect(normalizer.calls).toHaveLength(0);
        expect(transcriber.calls).toHaveLength(0);
    });

    it('limits by the user id', async () => {
        const limiter = new FakeLimiter(ALLOWED);
        await setup({ limiter }).useCase.execute(upload, idle);
        expect(limiter.users).toEqual(['user-1']);
    });

    it('passes the signal to the normalizer and the provider', async () => {
        const controller = new AbortController();
        const transcriber = FakeTranscriber.hanging();
        const { useCase, normalizer } = setup({ transcriber });
        const pending = useCase.execute(upload, controller.signal);
        await vi.waitFor(() => {
            expect(transcriber.calls).toHaveLength(1);
        });
        expect(normalizer.calls[0]?.signal).toBe(controller.signal);
        expect(transcriber.calls[0]?.signal.aborted).toBe(false);
        controller.abort();
        expect(transcriber.calls[0]?.signal.aborted).toBe(true);
        expect(await pending).toEqual({ kind: 'rejected', reason: 'provider-unavailable' });
    });

    it('maps an unreadable file to unsupported-format', async () => {
        const { useCase, transcriber } = setup({
            normalizer: new FakeNormalizer(() =>
                Promise.reject(new UnsupportedVoiceAudioError('x')),
            ),
        });
        expect(await useCase.execute(upload, idle)).toEqual({
            kind: 'rejected',
            reason: 'unsupported-format',
        });
        expect(transcriber.calls).toHaveLength(0);
    });

    it('maps missing ffmpeg to provider-unavailable', async () => {
        const { useCase } = setup({
            normalizer: new FakeNormalizer(() =>
                Promise.reject(new VoiceAudioUnavailableError('x')),
            ),
        });
        expect(await useCase.execute(upload, idle)).toEqual({
            kind: 'rejected',
            reason: 'provider-unavailable',
        });
    });

    it('never logs the audio or the text', async () => {
        const { useCase, log } = setup({});
        await useCase.execute(upload, idle);
        const dump = log.dump();
        expect(dump).not.toContain('webm-secret-bytes');
        expect(dump).not.toContain('ogg-bytes');
        expect(dump).not.toContain('привет');
    });
});
