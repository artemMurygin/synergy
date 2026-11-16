import { describe, expect, it } from 'vitest';
import { TranscriptionTemporaryError } from '../domain/errors';
import type { DiarizedTranscript } from '../domain/diarized-transcript';
import type { WholeFileWord } from '../domain/ports/whole-file-stt.port';
import { UNRECOGNIZED_SPEAKER } from '../domain/transcript-segment';
import { wordsToTranscript } from './words-to-transcript';

const word = (
    text: string | null,
    start: number | null,
    end: number | null,
    speakerId: string | null,
    type: string | null = 'word',
): WholeFileWord => ({ type, text, start, end, speakerId });

const convert = (
    words: readonly WholeFileWord[],
    language: string | null = 'ru',
): DiarizedTranscript => wordsToTranscript({ language, words }, 120);

describe('wordsToTranscript', () => {
    it('groups consecutive words of one speaker into segments from the start of the recording', () => {
        const transcript = convert([
            word('Привет', 0.5, 0.9, 'speaker_0'),
            word('мир', 1, 1.4, 'speaker_0'),
            word('Здравствуйте', 2, 2.8, 'speaker_1'),
            word('Ещё', 3, 3.2, 'speaker_0'),
        ]);

        expect(transcript.language).toBe('ru');
        expect(transcript.durationSec).toBe(120);
        expect(transcript.segments).toEqual([
            { seq: 0, speaker: 1, startSec: 0.5, endSec: 1.4, text: 'Привет мир' },
            { seq: 1, speaker: 2, startSec: 2, endSec: 2.8, text: 'Здравствуйте' },
            { seq: 2, speaker: 1, startSec: 3, endSec: 3.2, text: 'Ещё' },
        ]);
    });

    it('numbers speakers by first appearance, not by label', () => {
        const transcript = convert([
            word('а', 0, 1, 'speaker_5'),
            word('б', 1, 2, 'speaker_2'),
            word('в', 2, 3, 'speaker_5'),
        ]);

        expect(transcript.segments.map((s) => s.speaker)).toEqual([1, 2, 1]);
    });

    it('keeps only speech words and skips spacing and audio events', () => {
        const transcript = convert([
            word('Да', 0, 0.3, 'speaker_0'),
            word(' ', 0.3, 0.4, 'speaker_0', 'spacing'),
            word('(смех)', 0.4, 1, 'speaker_1', 'audio_event'),
            word('нет', 1, 1.3, 'speaker_0'),
        ]);

        expect(transcript.segments).toEqual([
            { seq: 0, speaker: 1, startSec: 0, endSec: 1.3, text: 'Да нет' },
        ]);
    });

    it.each([
        ['no start', word('x', null, 1, 'speaker_0')],
        ['no end', word('x', 0, null, 'speaker_0')],
        ['negative start', word('x', -1, 1, 'speaker_0')],
        ['end before start', word('x', 2, 1, 'speaker_0')],
        ['NaN time', word('x', Number.NaN, 1, 'speaker_0')],
        ['blank text', word('  ', 0, 1, 'speaker_0')],
        ['no text', word(null, 0, 1, 'speaker_0')],
    ])('drops a word with %s', (_name, bad) => {
        const transcript = convert([word('ok', 5, 6, 'speaker_0'), bad]);

        expect(transcript.segments).toEqual([
            { seq: 0, speaker: 1, startSec: 5, endSec: 6, text: 'ok' },
        ]);
    });

    it.each([
        ['no speaker', null],
        ['empty speaker', ''],
    ])(
        'marks a word with %s as unrecognized without taking a speaker number',
        (_name, speakerId) => {
            const transcript = convert([
                word('a', 0, 1, 'speaker_0'),
                word('b', 1, 2, speakerId),
                word('c', 2, 3, 'speaker_1'),
            ]);

            expect(transcript.segments).toEqual([
                { seq: 0, speaker: 1, startSec: 0, endSec: 1, text: 'a' },
                { seq: 1, speaker: UNRECOGNIZED_SPEAKER, startSec: 1, endSec: 2, text: 'b' },
                { seq: 2, speaker: 2, startSec: 2, endSec: 3, text: 'c' },
            ]);
        },
    );

    it('keeps a provider label "unknown" apart from unrecognized words', () => {
        const transcript = convert([word('a', 0, 1, 'unknown'), word('b', 1, 2, null)]);

        expect(transcript.segments.map((segment) => segment.speaker)).toEqual([
            1,
            UNRECOGNIZED_SPEAKER,
        ]);
    });

    it('marks all words as unrecognized when no word has a speaker label', () => {
        const transcript = convert([word('a', 0, 1, null), word('b', 1, 2, null)]);

        expect(transcript.segments).toEqual([
            { seq: 0, speaker: UNRECOGNIZED_SPEAKER, startSec: 0, endSec: 2, text: 'a b' },
        ]);
    });

    it('orders words by time before grouping', () => {
        const transcript = convert([
            word('второе', 2, 3, 'speaker_0'),
            word('первое', 0, 1, 'speaker_0'),
        ]);

        expect(transcript.segments).toEqual([
            { seq: 0, speaker: 1, startSec: 0, endSec: 3, text: 'первое второе' },
        ]);
    });

    it('returns no segments for an empty answer (no speech)', () => {
        const transcript = convert([]);

        expect(transcript.segments).toEqual([]);
        expect(transcript.durationSec).toBe(120);
    });

    it('returns no segments when there are only non-speech elements', () => {
        const transcript = convert([
            word('(музыка)', 0, 5, 'speaker_0', 'audio_event'),
            word(' ', 5, 6, null, 'spacing'),
        ]);

        expect(transcript.segments).toEqual([]);
    });

    it('fails when speech words exist but none is valid', () => {
        expect(() =>
            convert([word('x', null, null, 'speaker_0'), word('y', 3, 1, 'speaker_0')]),
        ).toThrow(TranscriptionTemporaryError);
    });

    it('maps an unknown language to null', () => {
        expect(convert([], null).language).toBeNull();
    });
});
