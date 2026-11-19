import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectTestRedis, disconnectTestRedis } from '../../shared/testing/test-redis';
import { type HttpFixture, startHttpFixture } from '../files/interface/http/testing/http-fixture';
import { FakeTranscriber, recordingLogger } from './application/test-doubles';
import { TranscribeUploadedVoiceUseCase } from './application/transcribe-uploaded-voice.use-case';
import { TranscribeVoiceUseCase } from './application/transcribe-voice.use-case';
import { TranscriptionResult } from './domain/transcription-result';
import { FfmpegVoiceAudioNormalizer } from './infrastructure/ffmpeg/ffmpeg-voice-audio-normalizer';
import { RedisVoiceRateLimiter } from './infrastructure/redis/redis-voice-rate-limiter';
import { VoiceTranscriptionsController } from './interface/http/voice-transcriptions.controller';

/**
 * Voice transcription over HTTP: real ffmpeg, real Redis and the real guards; only the provider
 * is a fake.
 */
const LIMIT = 20;
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

function webmRecording(seconds: number): Buffer {
    // webm to a pipe carries no duration, as a MediaRecorder recording.
    const result = spawnSync(
        'ffmpeg',
        [
            '-v',
            'error',
            '-f',
            'lavfi',
            '-i',
            `sine=d=${String(seconds)}`,
            '-c:a',
            'libopus',
            '-f',
            'webm',
            'pipe:1',
        ],
        { maxBuffer: 20_000_000 },
    );
    if (result.status !== 0) throw new Error('fixture failed');
    return result.stdout;
}

describe.skipIf(!hasFfmpeg)('voice transcription over HTTP', () => {
    const prefix = `test:${randomUUID()}:`;
    let redis: Redis | null = null;
    let fixture: HttpFixture | undefined;
    let webm: Buffer;
    const transcriber = FakeTranscriber.answering(TranscriptionResult.text('Позвони клиенту'));

    beforeAll(async () => {
        redis = await connectTestRedis();
        if (redis === null) return;
        webm = webmRecording(2);
        const log = recordingLogger().logger;
        const useCase = new TranscribeUploadedVoiceUseCase(
            new RedisVoiceRateLimiter(redis, { limit: LIMIT, prefix }, log),
            new FfmpegVoiceAudioNormalizer({ timeoutMs: 20_000 }, log),
            new TranscribeVoiceUseCase(transcriber, log),
            log,
        );
        fixture = await startHttpFixture({
            controllers: [VoiceTranscriptionsController],
            providers: [{ provide: TranscribeUploadedVoiceUseCase, useValue: useCase }],
        });
    });
    afterAll(async () => {
        await fixture?.app.close();
        await disconnectTestRedis(redis, [`${prefix}*`]);
    });

    const post = (headers: Record<string, string>): Promise<Response> => {
        const body = new FormData();
        body.append(
            'audio',
            new Blob([new Uint8Array(webm)], { type: 'audio/webm;codecs=opus' }),
            'v.webm',
        );
        return fetch(`${fixture?.base ?? ''}/transcriptions/voice`, {
            method: 'POST',
            headers,
            body,
        });
    };

    it('turns a webm recording into text with the measured duration', async (ctx) => {
        if (fixture === undefined) return ctx.skip();
        const response = await post({ ...fixture.bearer(), 'x-client-app': 'employee-app' });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ kind: 'text', text: 'Позвони клиенту' });
        const clip = transcriber.calls.at(-1)?.clip;
        expect(clip?.mimeType).toBe('audio/ogg');
        expect(clip?.durationSec).toBeGreaterThan(1.8);
        expect(clip?.durationSec).toBeLessThan(2.3);
    });

    it('answers 401 without a token', async (ctx) => {
        if (fixture === undefined) return ctx.skip();
        expect((await post({})).status).toBe(401);
    });

    it('rejects an unknown client header (ClientAppGuard answers 400)', async (ctx) => {
        if (fixture === undefined) return ctx.skip();
        const response = await post({ ...fixture.bearer(), 'x-client-app': 'telegram' });
        expect(response.status).toBe(400);
    });

    it('answers 429 with Retry-After on the 21st request within a minute', async (ctx) => {
        if (fixture === undefined) return ctx.skip();
        const headers = fixture.bearer();
        // The first test already made request 1 of 20.
        for (let i = 2; i <= LIMIT; i++) expect((await post(headers)).status).toBe(200);
        const limited = await post(headers);
        expect(limited.status).toBe(429);
        expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    });
});
