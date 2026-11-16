import { describe, expect, it } from 'vitest';
import { InvalidCallTranscriptError } from '../errors';
import { CallId } from '../value-objects/call-id.value-object';
import { CallTranscript } from './call-transcript.entity';
import { CallTranscriptLine } from './call-transcript-line.entity';

function buildLine(lineIndex: number): CallTranscriptLine {
    return new CallTranscriptLine({
        callId: 42,
        lineIndex,
        speakerName: 'Иван',
        speakerRole: 'manager',
        startTimeSeconds: lineIndex,
        endTimeSeconds: lineIndex + 1,
        text: `Строка ${String(lineIndex)}`,
    });
}

describe('CallTranscript', () => {
    it('accepts lines with a monotonically increasing lineIndex without gaps', () => {
        const transcript = CallTranscript.create({
            callId: new CallId(42),
            lines: [buildLine(0), buildLine(1), buildLine(2)],
        });

        expect(transcript.callId.value).toBe(42);
        expect(transcript.lines).toHaveLength(3);
    });

    it('accepts an empty transcript', () => {
        const transcript = CallTranscript.create({ callId: new CallId(42), lines: [] });

        expect(transcript.lines).toHaveLength(0);
    });

    it('rejects lines with a gap in lineIndex', () => {
        expect(() =>
            CallTranscript.create({
                callId: new CallId(42),
                lines: [buildLine(0), buildLine(2)],
            }),
        ).toThrow(InvalidCallTranscriptError);
    });

    it('rejects lines that do not start at 0', () => {
        expect(() =>
            CallTranscript.create({
                callId: new CallId(42),
                lines: [buildLine(1), buildLine(2)],
            }),
        ).toThrow(InvalidCallTranscriptError);
    });

    it('rejects lines given out of order', () => {
        expect(() =>
            CallTranscript.create({
                callId: new CallId(42),
                lines: [buildLine(1), buildLine(0)],
            }),
        ).toThrow(InvalidCallTranscriptError);
    });

    it('rejects duplicated lineIndex values', () => {
        expect(() =>
            CallTranscript.create({
                callId: new CallId(42),
                lines: [buildLine(0), buildLine(0)],
            }),
        ).toThrow(InvalidCallTranscriptError);
    });
});
