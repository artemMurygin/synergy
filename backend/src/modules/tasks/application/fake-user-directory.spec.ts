import { describe, expect, it } from 'vitest';
import { FakeUserDirectory } from './test-doubles';

describe('FakeUserDirectory.searchActive', () => {
    const directory = new FakeUserDirectory([
        { id: 'u-1', login: 'Alice.Smith' },
        { id: 'u-2', login: 'bob' },
        { id: 'u-3', login: 'malice' },
    ]);

    it('finds users by a case-insensitive substring of the login', async () => {
        const result = await directory.searchActive('ALICE', 10);
        expect(result.map((u) => u.id)).toEqual(['u-1', 'u-3']);
    });

    it('returns nothing when nobody matches or the query is blank', async () => {
        expect(await directory.searchActive('zzz', 10)).toEqual([]);
        expect(await directory.searchActive('  ', 10)).toEqual([]);
    });

    it('respects the limit', async () => {
        expect(await directory.searchActive('a', 1)).toHaveLength(1);
    });
});
