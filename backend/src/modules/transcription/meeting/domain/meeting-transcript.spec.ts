import { describe, expect, it } from 'vitest';
import { ConflictError } from '../../../../shared/errors';
import { DiarizedTranscript } from './diarized-transcript';
import {
    InvalidMeetingTranscriptStateError,
    InvalidSpeakerNameError,
    MeetingTranscriptNotRetryableError,
    MeetingTranscriptTransitionError,
    TranscriptNotReadyError,
    UnknownSpeakerError,
} from './errors';
import {
    MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE,
    MeetingTranscriptCompletedEvent,
} from './events/meeting-transcript-completed.event';
import {
    MEETING_TRANSCRIPT_FAILED_EVENT_TYPE,
    MeetingTranscriptFailedEvent,
} from './events/meeting-transcript-failed.event';
import { MeetingTranscript } from './meeting-transcript';
import type { SpeakerAssignmentInput } from './speaker-assignment';
import { SpeakerNames } from './speaker-names';
import { TranscriptSegment } from './transcript-segment';

const FILE_ID = '0b9c1f7e-5d0a-4c3e-9a51-6f1f2d3c4b5a';
const OWNER_ID = 'user-1';
const T0 = new Date('2026-11-01T10:00:00Z');
const T1 = new Date('2026-11-01T10:05:00Z');

const seg = (
    seq: number,
    speaker: number,
    startSec: number,
    endSec: number,
    text = 'текст',
): TranscriptSegment => TranscriptSegment.of({ seq, speaker, startSec, endSec, text });

const dialog = DiarizedTranscript.of({
    language: 'ru',
    durationSec: 30,
    segments: [seg(0, 1, 0, 10), seg(1, 2, 10, 20), seg(2, 1, 20, 30)],
});

const assign = (speaker: number, name: string | null): SpeakerAssignmentInput => ({
    speaker,
    name,
});

function completed(): MeetingTranscript {
    const t = processing();
    t.complete(dialog, T1);
    t.pullDomainEvents();
    return t;
}

const silence = DiarizedTranscript.of({ language: null, durationSec: 30, segments: [] });

function pending(): MeetingTranscript {
    return MeetingTranscript.createPending({ fileId: FILE_ID, ownerId: OWNER_ID, now: T0 });
}

function processing(): MeetingTranscript {
    const t = pending();
    t.start();
    return t;
}

function failed(): MeetingTranscript {
    const t = processing();
    t.fail('provider-unavailable', T1);
    t.pullDomainEvents();
    return t;
}

describe('MeetingTranscript', () => {
    it('is created pending, without result and events', () => {
        const t = pending();

        expect(t.fileId).toBe(FILE_ID);
        expect(t.ownerId).toBe(OWNER_ID);
        expect(t.status).toBe('pending');
        expect(t.attempts).toBe(0);
        expect(t.speakerCount).toBe(0);
        expect(t.speakerNames.entries()).toEqual([]);
        expect(t.failureReason).toBeNull();
        expect(t.completedAt).toBeNull();
        expect(t.pullDomainEvents()).toEqual([]);
    });

    it('goes pending → processing and counts the attempt', () => {
        const t = processing();

        expect(t.status).toBe('processing');
        expect(t.attempts).toBe(1);
    });

    it('starts again from processing on a queue retry and counts the attempt', () => {
        const t = processing();
        t.start();

        expect(t.status).toBe('processing');
        expect(t.attempts).toBe(2);
    });

    it('goes processing → completed with speaker count, language and duration', () => {
        const t = processing();
        t.complete(dialog, T1);

        expect(t.status).toBe('completed');
        expect(t.speakerCount).toBe(2);
        expect('segments' in t).toBe(false);
        expect(t.language).toBe('ru');
        expect(t.durationSec).toBe(30);
        expect(t.completedAt).toEqual(T1);
        expect(t.failureReason).toBeNull();
    });

    it('counts speakers by distinct numbers', () => {
        const t = processing();
        t.complete(dialog, T1);

        expect(t.speakerCount).toBe(2);
    });

    it('completes with empty segments as no_speech', () => {
        const t = processing();
        t.complete(silence, T1);

        expect(t.status).toBe('no_speech');
        expect(t.speakerCount).toBe(0);
        expect(t.durationSec).toBe(30);
        expect(t.completedAt).toEqual(T1);
    });

    it.each(['pending', 'processing'] as const)('fails from %s with a reason', (from) => {
        const t = from === 'pending' ? pending() : processing();
        t.fail('too-long', T1);

        expect(t.status).toBe('failed');
        expect(t.failureReason).toBe('too-long');
        expect(t.completedAt).toEqual(T1);
        expect(t.speakerCount).toBe(0);
    });

    it('retries only from failed: back to pending, reason cleared', () => {
        const t = failed();
        t.retry();

        expect(t.status).toBe('pending');
        expect(t.failureReason).toBeNull();
        expect(t.completedAt).toBeNull();
        expect(t.attempts).toBe(1);
    });

    it.each([
        ['pending', pending],
        ['processing', processing],
        [
            'completed',
            () => {
                const t = processing();
                t.complete(dialog, T1);
                return t;
            },
        ],
        [
            'no_speech',
            () => {
                const t = processing();
                t.complete(silence, T1);
                return t;
            },
        ],
    ])('refuses retry from %s with a conflict', (_status, make) => {
        const t = make();

        expect(() => {
            t.retry();
        }).toThrow(MeetingTranscriptNotRetryableError);
        expect(() => {
            t.retry();
        }).toThrow(ConflictError);
    });

    it('returns the previous failure from retry and restores it on abandonRetry', () => {
        const t = processing();
        t.fail('too-long', T1);
        t.pullDomainEvents();

        const previous = t.retry();
        t.abandonRetry(previous);

        expect(previous).toEqual({ reason: 'too-long', failedAt: T1 });
        expect(t.status).toBe('failed');
        expect(t.failureReason).toBe('too-long');
        expect(t.completedAt).toEqual(T1);
        expect(t.pullDomainEvents()).toEqual([]);
    });

    it('refuses abandonRetry outside pending', () => {
        const t = processing();

        expect(() => {
            t.abandonRetry({ reason: 'too-long', failedAt: T1 });
        }).toThrow(MeetingTranscriptTransitionError);
    });

    describe('forbidden transitions', () => {
        it('cannot complete from pending', () => {
            expect(() => {
                pending().complete(dialog, T1);
            }).toThrow(MeetingTranscriptTransitionError);
        });

        it('cannot complete or fail twice', () => {
            const t = processing();
            t.complete(dialog, T1);

            expect(() => {
                t.complete(dialog, T1);
            }).toThrow(MeetingTranscriptTransitionError);
            expect(() => {
                t.fail('timeout', T1);
            }).toThrow(MeetingTranscriptTransitionError);
            expect(() => {
                t.start();
            }).toThrow(MeetingTranscriptTransitionError);
        });

        it('cannot start, complete or fail from failed', () => {
            const t = failed();

            expect(() => {
                t.start();
            }).toThrow(MeetingTranscriptTransitionError);
            expect(() => {
                t.complete(dialog, T1);
            }).toThrow(MeetingTranscriptTransitionError);
            expect(() => {
                t.fail('timeout', T1);
            }).toThrow(MeetingTranscriptTransitionError);
        });

        it('leaves the state unchanged after a refused transition', () => {
            const t = pending();

            expect(() => {
                t.complete(dialog, T1);
            }).toThrow();
            expect(t.status).toBe('pending');
            expect(t.pullDomainEvents()).toEqual([]);
        });
    });

    describe('events', () => {
        it('records «completed» with file, owner and status, without text', () => {
            const t = processing();
            t.complete(dialog, T1);
            const events = t.pullDomainEvents();

            expect(events).toHaveLength(1);
            const [event] = events;
            expect(event).toBeInstanceOf(MeetingTranscriptCompletedEvent);
            if (!(event instanceof MeetingTranscriptCompletedEvent)) return;
            expect(event.fileId).toBe(FILE_ID);
            expect(event.ownerId).toBe(OWNER_ID);
            expect(event.status).toBe('completed');
            expect(event.metadata.timestamp).toBe(T1.getTime());
            expect(JSON.stringify(event)).not.toContain('текст');
            expect(MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE).toBe('meeting-transcript.completed');
        });

        it('records «completed» with status no_speech', () => {
            const t = processing();
            t.complete(silence, T1);
            const [event] = t.pullDomainEvents();

            expect(event).toMatchObject({ status: 'no_speech' });
        });

        it('records «failed» with file, owner and reason', () => {
            const t = processing();
            t.fail('timeout', T1);
            const events = t.pullDomainEvents();

            expect(events).toHaveLength(1);
            const [event] = events;
            expect(event).toBeInstanceOf(MeetingTranscriptFailedEvent);
            if (!(event instanceof MeetingTranscriptFailedEvent)) return;
            expect(event.fileId).toBe(FILE_ID);
            expect(event.ownerId).toBe(OWNER_ID);
            expect(event.reason).toBe('timeout');
            expect(MEETING_TRANSCRIPT_FAILED_EVENT_TYPE).toBe('meeting-transcript.failed');
        });

        it('start and retry record no events', () => {
            const t = failed();
            t.retry();
            t.start();

            expect(t.pullDomainEvents()).toEqual([]);
        });
    });

    describe('restore', () => {
        const base = {
            fileId: FILE_ID,
            ownerId: OWNER_ID,
            language: null,
            durationSec: null,
            speakerCount: 0,
            speakerNames: SpeakerNames.empty(),
            attempts: 1,
            failureReason: null,
            completedAt: null,
            createdAt: T0,
            updatedAt: T0,
        } as const;

        it('restores a completed transcript', () => {
            const t = MeetingTranscript.restore({
                ...base,
                status: 'completed',
                language: 'ru',
                durationSec: 30,
                speakerCount: 2,
                speakerNames: SpeakerNames.of([[1, 'Анна']]),
                completedAt: T1,
            });

            expect(t.status).toBe('completed');
            expect(t.speakerCount).toBe(2);
            expect(t.speakerNames.labelOf(1)).toBe('Анна');
            expect(t.pullDomainEvents()).toEqual([]);
        });

        it('rejects failed without a reason', () => {
            expect(() =>
                MeetingTranscript.restore({ ...base, status: 'failed', completedAt: T1 }),
            ).toThrow(InvalidMeetingTranscriptStateError);
        });

        it('rejects a reason outside failed', () => {
            expect(() =>
                MeetingTranscript.restore({
                    ...base,
                    status: 'processing',
                    failureReason: 'timeout',
                }),
            ).toThrow(InvalidMeetingTranscriptStateError);
        });

        it('rejects speakers outside completed', () => {
            expect(() =>
                MeetingTranscript.restore({ ...base, status: 'processing', speakerCount: 2 }),
            ).toThrow(InvalidMeetingTranscriptStateError);
        });

        it('rejects a name of a speaker beyond the speaker count', () => {
            expect(() =>
                MeetingTranscript.restore({
                    ...base,
                    status: 'completed',
                    durationSec: 30,
                    speakerCount: 2,
                    speakerNames: SpeakerNames.of([[3, 'Ира']]),
                    completedAt: T1,
                }),
            ).toThrow(InvalidMeetingTranscriptStateError);
        });

        it('rejects completed without speakers', () => {
            expect(() =>
                MeetingTranscript.restore({ ...base, status: 'completed', completedAt: T1 }),
            ).toThrow(InvalidMeetingTranscriptStateError);
        });

        it('rejects a final status without completedAt', () => {
            expect(() =>
                MeetingTranscript.restore({ ...base, status: 'no_speech', durationSec: 3 }),
            ).toThrow(InvalidMeetingTranscriptStateError);
        });
    });

    describe('assignSpeakers', () => {
        it('assigns names to several speakers at once', () => {
            const t = completed();

            t.assignSpeakers([assign(1, 'Анна'), assign(2, 'Олег')]);

            expect(t.speakerNames.labelOf(1)).toBe('Анна');
            expect(t.speakerNames.labelOf(2)).toBe('Олег');
            expect(t.pullDomainEvents()).toEqual([]);
        });

        it('resets a name with an empty value', () => {
            const t = completed();
            t.assignSpeakers([assign(2, 'Олег')]);

            t.assignSpeakers([assign(2, '')]);

            expect(t.speakerNames.nameOf(2)).toBeNull();
            expect(t.speakerNames.labelOf(2)).toBe('Спикер 2');
        });

        it('allows the same name for two speakers', () => {
            const t = completed();

            t.assignSpeakers([assign(1, 'Олег'), assign(2, 'Олег')]);

            expect(t.speakerNames.labelOf(1)).toBe('Олег');
            expect(t.speakerNames.labelOf(2)).toBe('Олег');
        });

        it.each([
            ['pending', pending],
            ['processing', processing],
            ['failed', failed],
            [
                'no_speech',
                () => {
                    const t = processing();
                    t.complete(silence, T1);
                    return t;
                },
            ],
        ])('refuses names in status %s with TranscriptNotReadyError', (_status, make) => {
            const t = make();

            expect(() => {
                t.assignSpeakers([assign(1, 'Анна')]);
            }).toThrow(TranscriptNotReadyError);
            expect(() => {
                t.assignSpeakers([assign(1, 'Анна')]);
            }).toThrow(ConflictError);
        });

        it.each([0, -1])('rejects the speaker number %s as unknown', (speaker) => {
            expect(() => {
                completed().assignSpeakers([assign(speaker, 'Анна')]);
            }).toThrow(UnknownSpeakerError);
        });

        it('rejects unknown speakers with their list and changes no name', () => {
            const t = completed();
            t.assignSpeakers([assign(1, 'Анна')]);
            const updatedAt = t.updatedAt;

            let error: unknown;
            try {
                t.assignSpeakers([assign(1, 'Мария'), assign(3, 'Ира'), assign(7, 'Петя')]);
            } catch (e) {
                error = e;
            }

            expect(error).toBeInstanceOf(UnknownSpeakerError);
            if (!(error instanceof UnknownSpeakerError)) return;
            expect(error.speakers).toEqual([3, 7]);
            expect(t.speakerNames.labelOf(1)).toBe('Анна');
            expect(t.updatedAt).toBe(updatedAt);
        });

        it('reports an invalid name and changes no name', () => {
            const t = completed();

            t.assignSpeakers([assign(2, 'Олег')]);
            const updatedAt = t.updatedAt;

            expect(() => {
                t.assignSpeakers([assign(2, 'Ира'), assign(1, 'я'.repeat(101))]);
            }).toThrow(InvalidSpeakerNameError);
            expect(t.speakerNames.labelOf(2)).toBe('Олег');
            expect(t.speakerNames.nameOf(1)).toBeNull();
            expect(t.updatedAt).toBe(updatedAt);
        });
    });
});
