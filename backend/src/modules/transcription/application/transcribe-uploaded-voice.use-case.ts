import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { UnsupportedVoiceAudioError } from '../domain/errors';
import { VoiceAudioNormalizerPort } from '../domain/ports/voice-audio-normalizer.port';
import { VoiceRateLimiterPort } from '../domain/ports/voice-rate-limiter.port';
import { TranscriptionResult } from '../domain/transcription-result';
import { VoiceClip } from '../domain/voice-clip';
import { TranscribeVoiceUseCase } from './transcribe-voice.use-case';

export interface UploadedVoice {
    readonly userId: string;
    readonly audio: Buffer;
    /** MIME type the client declared; only a hint, the format is checked on the audio itself. */
    readonly mimeType: string;
}

export type UploadedVoiceResult =
    TranscriptionResult | { readonly kind: 'rate-limited'; readonly retryAfterSec: number };

/**
 * A recording uploaded over HTTP: the rate limit, then normalization with the duration measured
 * on the server, then `TranscribeVoiceUseCase`. The log holds neither the audio nor the text.
 */
@Injectable()
export class TranscribeUploadedVoiceUseCase {
    constructor(
        private readonly limiter: VoiceRateLimiterPort,
        private readonly normalizer: VoiceAudioNormalizerPort,
        private readonly transcribe: TranscribeVoiceUseCase,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(TranscribeUploadedVoiceUseCase.name);
    }

    async execute(input: UploadedVoice, signal: AbortSignal): Promise<UploadedVoiceResult> {
        const decision = await this.limiter.acquire(input.userId);
        if (!decision.allowed) {
            this.logger.info({ outcome: 'rate-limited' }, 'Voice upload rate limited');
            return { kind: 'rate-limited', retryAfterSec: decision.retryAfterSec };
        }

        let clip: VoiceClip;
        try {
            const normalized = await this.normalizer.normalize(input.audio, input.mimeType, signal);
            clip = VoiceClip.of({
                audio: normalized.audio,
                mimeType: normalized.mimeType,
                durationSec: normalized.durationSec,
            });
        } catch (error: unknown) {
            if (error instanceof UnsupportedVoiceAudioError) {
                this.logger.info(
                    { outcome: 'rejected', reason: 'unsupported-format' },
                    'Voice upload rejected',
                );
                return TranscriptionResult.rejected('unsupported-format');
            }
            this.logger.warn(
                {
                    outcome: 'rejected',
                    reason: 'provider-unavailable',
                    err: { type: error instanceof Error ? error.name : 'unknown' },
                },
                'Voice audio normalization failed',
            );
            return TranscriptionResult.rejected('provider-unavailable');
        }
        return this.transcribe.execute(clip, signal);
    }
}
