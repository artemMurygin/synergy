import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
    type HttpFixture,
    startHttpFixture,
    USER_ID,
} from '../../../files/interface/http/testing/http-fixture';
import { TranscribeUploadedVoiceUseCase } from '../../application/transcribe-uploaded-voice.use-case';
import { VoiceTranscriptionsController } from './voice-transcriptions.controller';

const useCase = { execute: vi.fn() };

const errorBody = z.object({ code: z.string().optional(), statusCode: z.number() });

function form(field: string, bytes: Uint8Array, type = 'audio/webm;codecs=opus'): FormData {
    const body = new FormData();
    body.append(field, new Blob([new Uint8Array(bytes)], { type }), 'voice.webm');
    return body;
}

describe('VoiceTranscriptionsController', () => {
    let fixture: HttpFixture;

    beforeAll(async () => {
        fixture = await startHttpFixture({
            controllers: [VoiceTranscriptionsController],
            providers: [{ provide: TranscribeUploadedVoiceUseCase, useValue: useCase }],
        });
    });
    afterAll(async () => {
        await fixture.app.close();
    });
    beforeEach(() => {
        vi.resetAllMocks();
        useCase.execute.mockResolvedValue({ kind: 'text', text: 'привет' });
    });

    const post = (
        body: FormData | undefined,
        headers: Record<string, string> = {},
    ): Promise<Response> =>
        fetch(`${fixture.base}/transcriptions/voice`, {
            method: 'POST',
            headers: { ...fixture.bearer(), ...headers },
            body,
        });
    const codeOf = async (response: Response): Promise<string | undefined> =>
        errorBody.parse(await response.json()).code;

    it('answers 200 with the text and passes user, audio and type to the use case', async () => {
        const response = await post(form('audio', new Uint8Array([1, 2, 3])));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ kind: 'text', text: 'привет' });
        const [input, signal] = useCase.execute.mock.calls[0] as [
            { userId: string; audio: Buffer; mimeType: string },
            AbortSignal,
        ];
        expect(input.userId).toBe(USER_ID);
        expect([...input.audio]).toEqual([1, 2, 3]);
        expect(input.mimeType).toBe('audio/webm');
        expect(signal.aborted).toBe(false);
    });

    it('answers 200 with no-speech', async () => {
        useCase.execute.mockResolvedValue({ kind: 'no-speech' });
        const response = await post(form('audio', new Uint8Array([1])));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ kind: 'no-speech' });
    });

    it('answers 400 VOICE_AUDIO_REQUIRED without the audio field', async () => {
        const response = await post(form('other', new Uint8Array([1])));
        expect(response.status).toBe(400);
        expect(await codeOf(response)).toBe('VOICE_AUDIO_REQUIRED');
        expect(useCase.execute).not.toHaveBeenCalled();
    });

    it('answers 400 VOICE_AUDIO_REQUIRED for an empty file', async () => {
        const response = await post(form('audio', new Uint8Array([])));
        expect(response.status).toBe(400);
        expect(await codeOf(response)).toBe('VOICE_AUDIO_REQUIRED');
    });

    it('answers 413 VOICE_TOO_LARGE over 5 MB without calling the use case', async () => {
        const response = await post(form('audio', new Uint8Array(5 * 1024 * 1024 + 1024)));
        expect(response.status).toBe(413);
        expect(await codeOf(response)).toBe('VOICE_TOO_LARGE');
        expect(useCase.execute).not.toHaveBeenCalled();
    });

    it.each([
        [{ kind: 'rejected', reason: 'too-long' }, 413, 'VOICE_TOO_LONG'],
        [{ kind: 'rejected', reason: 'too-large' }, 413, 'VOICE_TOO_LARGE'],
        [{ kind: 'rejected', reason: 'unsupported-format' }, 415, 'VOICE_UNSUPPORTED_FORMAT'],
        [{ kind: 'rejected', reason: 'provider-unavailable' }, 503, 'VOICE_PROVIDER_UNAVAILABLE'],
    ])('maps %o to %i %s', async (result, status, code) => {
        useCase.execute.mockResolvedValue(result);
        const response = await post(form('audio', new Uint8Array([1])));
        expect(response.status).toBe(status);
        expect(await codeOf(response)).toBe(code);
    });

    it('answers 429 VOICE_RATE_LIMITED with Retry-After', async () => {
        useCase.execute.mockResolvedValue({ kind: 'rate-limited', retryAfterSec: 37 });
        const response = await post(form('audio', new Uint8Array([1])));
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('37');
        expect(await codeOf(response)).toBe('VOICE_RATE_LIMITED');
    });

    it('answers 400 for a body that is not multipart', async () => {
        const response = await fetch(`${fixture.base}/transcriptions/voice`, {
            method: 'POST',
            headers: { ...fixture.bearer(), 'content-type': 'application/json' },
            body: '{}',
        });
        expect(response.status).toBe(400);
    });

    it('aborts the use case when the client closes the connection', async () => {
        useCase.execute.mockImplementation(() => new Promise(() => undefined));
        const client = new AbortController();
        const pending = fetch(`${fixture.base}/transcriptions/voice`, {
            method: 'POST',
            headers: fixture.bearer(),
            body: form('audio', new Uint8Array([2])),
            signal: client.signal,
        }).catch(() => undefined);
        await vi.waitFor(() => {
            expect(useCase.execute).toHaveBeenCalledTimes(1);
        });
        const signal = (useCase.execute.mock.calls[0] as [unknown, AbortSignal])[1];
        expect(signal.aborted).toBe(false);
        client.abort();
        await pending;
        await vi.waitFor(() => {
            expect(signal.aborted).toBe(true);
        });
    });

    it('requires a token', async () => {
        const response = await fetch(`${fixture.base}/transcriptions/voice`, {
            method: 'POST',
            body: form('audio', new Uint8Array([1])),
        });
        expect(response.status).toBe(401);
    });
});
