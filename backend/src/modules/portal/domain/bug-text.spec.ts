import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { BugDescription } from './bug-description';
import { BugTitle } from './bug-title';
import { WontFixReason } from './wont-fix-reason';

describe('BugTitle', () => {
    it('trims surrounding whitespace', () => {
        expect(BugTitle.of('  Не грузится  ').value).toBe('Не грузится');
    });

    it('rejects empty or blank', () => {
        expect(() => BugTitle.of('')).toThrow(ArgumentInvalidError);
        expect(() => BugTitle.of('   ')).toThrow(ArgumentInvalidError);
    });

    it('enforces 200 after trimming', () => {
        expect(BugTitle.of(` ${'a'.repeat(200)} `).value).toHaveLength(200);
        expect(() => BugTitle.of('a'.repeat(201))).toThrow(ArgumentInvalidError);
    });
});

describe('BugDescription', () => {
    it('trims edges and keeps inner line breaks', () => {
        expect(BugDescription.of('\n  первая\nвторая \n').value).toBe('первая\nвторая');
    });

    it('rejects empty or blank', () => {
        expect(() => BugDescription.of(' \n ')).toThrow(ArgumentInvalidError);
    });

    it('enforces 4000 after trimming', () => {
        expect(BugDescription.of(` ${'a'.repeat(4000)} `).value).toHaveLength(4000);
        expect(() => BugDescription.of('a'.repeat(4001))).toThrow(ArgumentInvalidError);
    });
});

describe('WontFixReason', () => {
    it('trims surrounding whitespace', () => {
        expect(WontFixReason.of(' так задумано ').value).toBe('так задумано');
    });

    it('rejects empty or blank', () => {
        expect(() => WontFixReason.of('  ')).toThrow(ArgumentInvalidError);
    });

    it('enforces 2000 after trimming', () => {
        expect(WontFixReason.of(` ${'a'.repeat(2000)} `).value).toHaveLength(2000);
        expect(() => WontFixReason.of('a'.repeat(2001))).toThrow(ArgumentInvalidError);
    });
});
