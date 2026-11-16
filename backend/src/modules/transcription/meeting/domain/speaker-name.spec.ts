import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../../shared/errors';
import { InvalidSpeakerNameError, UnknownSpeakerError } from './errors';
import { SpeakerAssignment } from './speaker-assignment';
import { SpeakerName } from './speaker-name';
import { SpeakerNames } from './speaker-names';

describe('SpeakerName', () => {
    it('keeps the trimmed name', () => {
        expect(SpeakerName.of('  Анна  ').value).toBe('Анна');
    });

    it.each([
        ['one character', 'А'],
        ['100 characters', 'я'.repeat(100)],
    ])('accepts %s', (_case, raw) => {
        expect(SpeakerName.of(raw).value).toBe(raw);
    });

    it.each([
        ['empty', ''],
        ['blank', '   '],
        ['101 characters', 'я'.repeat(101)],
    ])('rejects %s', (_case, raw) => {
        expect(() => SpeakerName.of(raw)).toThrow(InvalidSpeakerNameError);
        expect(() => SpeakerName.of(raw)).toThrow(ArgumentInvalidError);
    });
});

describe('SpeakerAssignment', () => {
    it('assigns a trimmed name', () => {
        const a = SpeakerAssignment.of({ speaker: 2, name: ' Олег ' });

        expect(a.speaker).toBe(2);
        expect(a.name?.value).toBe('Олег');
    });

    it.each([null, '', '   '])('treats %j as a reset', (name) => {
        expect(SpeakerAssignment.of({ speaker: 1, name }).name).toBeNull();
    });

    it('rejects a too long name', () => {
        expect(() => SpeakerAssignment.of({ speaker: 1, name: 'я'.repeat(101) })).toThrow(
            InvalidSpeakerNameError,
        );
    });

    it.each([0, -1, 1.5])('rejects the speaker number %s', (speaker) => {
        expect(() => SpeakerAssignment.of({ speaker, name: 'Анна' })).toThrow(UnknownSpeakerError);
    });
});

describe('SpeakerNames', () => {
    it('labels the unrecognized speaker 0 «Нераспознан»', () => {
        expect(SpeakerNames.empty().labelOf(0)).toBe('Нераспознан');
    });

    it('is empty by default and labels speakers «Спикер N»', () => {
        const names = SpeakerNames.empty();

        expect(names.labelOf(1)).toBe('Спикер 1');
        expect(names.nameOf(3)).toBeNull();
        expect(names.entries()).toEqual([]);
    });

    it('returns a new map on assign and leaves the old one unchanged', () => {
        const before = SpeakerNames.empty();

        const after = before.assign([SpeakerAssignment.of({ speaker: 1, name: 'Анна' })]);

        expect(after).not.toBe(before);
        expect(after.labelOf(1)).toBe('Анна');
        expect(before.labelOf(1)).toBe('Спикер 1');
    });

    it('resets a name with an empty value', () => {
        const names = SpeakerNames.of([[2, 'Олег']]).assign([
            SpeakerAssignment.of({ speaker: 2, name: '' }),
        ]);

        expect(names.nameOf(2)).toBeNull();
        expect(names.labelOf(2)).toBe('Спикер 2');
        expect(names.entries()).toEqual([]);
    });

    it('allows the same name for two speakers', () => {
        const names = SpeakerNames.empty().assign([
            SpeakerAssignment.of({ speaker: 2, name: 'Олег' }),
            SpeakerAssignment.of({ speaker: 4, name: 'Олег' }),
        ]);

        expect(names.labelOf(2)).toBe('Олег');
        expect(names.labelOf(4)).toBe('Олег');
    });

    it('lists entries ordered by speaker number', () => {
        const names = SpeakerNames.of([
            [3, 'Ира'],
            [1, 'Анна'],
        ]);

        expect(names.entries()).toEqual([
            { speaker: 1, name: 'Анна' },
            { speaker: 3, name: 'Ира' },
        ]);
    });

    it('rejects an invalid stored name', () => {
        expect(() => SpeakerNames.of([[1, '  ']])).toThrow(InvalidSpeakerNameError);
    });
});
