import { PinoLogger } from 'nestjs-pino';
import { vi, type MockInstance } from 'vitest';
import { TranscriberPort } from '../domain/ports/transcriber.port';
import type { TranscriptionResult } from '../domain/transcription-result';
import type { VoiceClip } from '../domain/voice-clip';

type Behaviour = (clip: VoiceClip, signal: AbortSignal) => Promise<TranscriptionResult>;

/** Provider double: answers with the configured behaviour and records every call. */
export class FakeTranscriber extends TranscriberPort {
    readonly calls: { clip: VoiceClip; signal: AbortSignal }[] = [];

    constructor(private behaviour: Behaviour) {
        super();
    }

    static answering(result: TranscriptionResult): FakeTranscriber {
        return new FakeTranscriber(() => Promise.resolve(result));
    }

    static failing(error: Error): FakeTranscriber {
        return new FakeTranscriber(() => Promise.reject(error));
    }

    /** Never answers by itself, even after the signal is aborted. */
    static hanging(): FakeTranscriber {
        return new FakeTranscriber(() => new Promise<TranscriptionResult>(() => undefined));
    }

    transcribe(clip: VoiceClip, signal: AbortSignal): Promise<TranscriptionResult> {
        this.calls.push({ clip, signal });
        return this.behaviour(clip, signal);
    }
}

type LogMethod = PinoLogger['info'];

export interface RecordingLogger {
    readonly logger: PinoLogger;
    /** Everything passed to the logger, serialized, to assert what never gets logged. */
    readonly dump: () => string;
    readonly info: MockInstance<LogMethod>;
    readonly warn: MockInstance<LogMethod>;
    readonly error: MockInstance<LogMethod>;
}

/** A silent real logger whose calls are recorded. */
export function recordingLogger(): RecordingLogger {
    const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
    const info = vi.spyOn(logger, 'info');
    const warn = vi.spyOn(logger, 'warn');
    const error = vi.spyOn(logger, 'error');
    const debug = vi.spyOn(logger, 'debug');
    const dump = (): string =>
        JSON.stringify([info.mock.calls, warn.mock.calls, error.mock.calls, debug.mock.calls]);
    return { logger, dump, info, warn, error };
}
