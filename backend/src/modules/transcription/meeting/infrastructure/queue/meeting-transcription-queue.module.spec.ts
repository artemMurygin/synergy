import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../../../../shared/config/env.schema';
import {
    MeetingTranscriptionQueueModule,
    meetingTranscriptionJobOptions,
} from './meeting-transcription-queue.module';

function config(attempts: number): ConfigService<Env, true> {
    return new ConfigService<Env, true>({ MEETING_TRANSCRIPTION_ATTEMPTS: attempts });
}

describe('MeetingTranscriptionQueueModule', () => {
    it('registers the meeting-transcription queue', () => {
        const imports: unknown = Reflect.getMetadata('imports', MeetingTranscriptionQueueModule);
        expect(JSON.stringify(imports)).toContain('meeting-transcription');
    });

    it('takes attempts from env and retries with an exponential 30 s backoff', () => {
        const options = meetingTranscriptionJobOptions(config(5));

        expect(options.attempts).toBe(5);
        expect(options.backoff).toEqual({ type: 'exponential', delay: 30_000 });
    });
});
