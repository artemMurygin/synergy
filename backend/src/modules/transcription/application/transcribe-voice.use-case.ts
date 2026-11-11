import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TranscriptionProviderError } from '../domain/errors';
import { TranscriberPort } from '../domain/ports/transcriber.port';
import {
    TranscriptionResult,
    type TranscriptionRejectReason,
} from '../domain/transcription-result';
import type { VoiceClip } from '../domain/voice-clip';

const SECONDS_IN_MINUTE = 60;
const BYTES_IN_MB = 1024 * 1024;

export const MAX_VOICE_DURATION_SEC = 3 * SECONDS_IN_MINUTE;
export const MAX_VOICE_SIZE_BYTES = 5 * BYTES_IN_MB;
export const TRANSCRIPTION_TIMEOUT_MS = 30_000;

class TranscriptionTimeoutError extends Error {
    constructor() {
        super('Transcription timed out');
        this.name = 'TranscriptionTimeoutError';
    }
}

class TranscriptionCancelledError extends Error {
    constructor() {
        super('Transcription cancelled');
        this.name = 'TranscriptionCancelledError';
    }
}

/**
 * Turns a voice message into text. Every outcome is a result, failures never throw. The log
 * holds the duration, the size and the outcome, never the audio or the transcript.
 */
@Injectable()
export class TranscribeVoiceUseCase {
    constructor(
        private readonly transcriber: TranscriberPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(TranscribeVoiceUseCase.name);
    }

    /** `cancel` aborts the provider call, for example when the user started a new dialog. */
    async execute(clip: VoiceClip, cancel?: AbortSignal): Promise<TranscriptionResult> {
        const facts = { durationSec: clip.durationSec, sizeBytes: clip.sizeBytes };
        const reason = rejectReasonOf(clip);
        if (reason !== null) {
            this.logger.info({ ...facts, outcome: 'rejected', reason }, 'Voice clip rejected');
            return TranscriptionResult.rejected(reason);
        }

        const startedAt = Date.now();
        try {
            const result = await this.withTimeout(
                (signal) => this.transcriber.transcribe(clip, signal),
                cancel,
            );
            this.logger.info(
                { ...facts, outcome: result.kind, elapsedMs: Date.now() - startedAt },
                'Voice clip transcribed',
            );
            return result;
        } catch (error: unknown) {
            const elapsedMs = Date.now() - startedAt;
            if (error instanceof TranscriptionCancelledError) {
                this.logger.info(
                    { ...facts, outcome: 'cancelled', elapsedMs },
                    'Voice transcription cancelled',
                );
            } else {
                this.logger.warn(
                    {
                        ...facts,
                        outcome: 'rejected',
                        reason: 'provider-unavailable',
                        err: sanitizedError(error),
                        elapsedMs,
                    },
                    'Voice transcription failed',
                );
            }
            return TranscriptionResult.rejected('provider-unavailable');
        }
    }

    /**
     * Aborts the call and stops waiting after the timeout or on `cancel`, even if the provider
     * ignores the signal.
     */
    private async withTimeout<T>(
        call: (signal: AbortSignal) => Promise<T>,
        cancel: AbortSignal | undefined,
    ): Promise<T> {
        const controller = new AbortController();
        let timer: NodeJS.Timeout | undefined;
        let onCancel: (() => void) | undefined;
        const stop = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                controller.abort();
                reject(new TranscriptionTimeoutError());
            }, TRANSCRIPTION_TIMEOUT_MS);
            onCancel = (): void => {
                controller.abort();
                reject(new TranscriptionCancelledError());
            };
            if (cancel?.aborted === true) onCancel();
            else cancel?.addEventListener('abort', onCancel, { once: true });
        });
        try {
            if (controller.signal.aborted) return await stop;
            return await Promise.race([call(controller.signal), stop]);
        } finally {
            clearTimeout(timer);
            if (onCancel !== undefined) cancel?.removeEventListener('abort', onCancel);
        }
    }
}

function rejectReasonOf(clip: VoiceClip): TranscriptionRejectReason | null {
    if (clip.durationSec > MAX_VOICE_DURATION_SEC) return 'too-long';
    if (clip.sizeBytes > MAX_VOICE_SIZE_BYTES) return 'too-large';
    if (clip.format === null) return 'unsupported-format';
    return null;
}

/**
 * The error for the `err` log field without its message and stack: provider messages may echo
 * what the user said.
 */
function sanitizedError(error: unknown): { type: string; metadata?: unknown } {
    if (error instanceof TranscriptionTimeoutError) return { type: 'timeout' };
    if (error instanceof TranscriptionProviderError) {
        return { type: error.name, metadata: error.metadata };
    }
    return { type: error instanceof Error ? error.name : 'unknown' };
}
