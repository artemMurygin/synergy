import { describe, expect, it } from 'vitest';
import { formatSeedReport, parseSeedUsers } from './seed-users.cli';

describe('parseSeedUsers', () => {
    it('returns an empty list when the variable is unset', () => {
        expect(parseSeedUsers(undefined)).toEqual([]);
    });

    it('parses logins with an optional password', () => {
        expect(parseSeedUsers('[{"login":"a"},{"login":"b","password":"p"}]')).toEqual([
            { login: 'a' },
            { login: 'b', password: 'p' },
        ]);
    });

    it('rejects malformed input', () => {
        expect(() => parseSeedUsers('{')).toThrow();
        expect(() => parseSeedUsers('{"login":"a"}')).toThrow();
        expect(() => parseSeedUsers('[{"password":"p"}]')).toThrow();
    });
});

describe('formatSeedReport', () => {
    it('prints generated passwords and skipped logins', () => {
        const text = formatSeedReport({
            created: [{ login: 'a', generatedPassword: 'pw1' }, { login: 'b' }],
            skipped: ['c'],
        });
        expect(text).toContain('a\tpw1');
        expect(text).toContain('created: b');
        expect(text).toContain('skipped: c');
    });
});
