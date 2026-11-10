import { describe, expect, it } from 'vitest';
import { InvalidUserSearchError, MAX_USER_SEARCH_LENGTH, UserSearch } from './user-search';

describe('UserSearch', () => {
    it('trims the text', () => {
        expect(UserSearch.of('  an ').text).toBe('an');
    });

    it('treats undefined, empty and whitespace-only input as no search', () => {
        expect(UserSearch.of(undefined).text).toBeNull();
        expect(UserSearch.of('').text).toBeNull();
        expect(UserSearch.of('   ').text).toBeNull();
    });

    it('rejects text longer than the maximum and accepts the maximum', () => {
        expect(() => UserSearch.of('a'.repeat(MAX_USER_SEARCH_LENGTH + 1))).toThrow(
            InvalidUserSearchError,
        );
        expect(UserSearch.of('a'.repeat(MAX_USER_SEARCH_LENGTH)).text).toHaveLength(
            MAX_USER_SEARCH_LENGTH,
        );
    });

    it('escapes LIKE wildcards and the escape character in the pattern', () => {
        expect(UserSearch.of('50%_a\\b').likePattern).toBe('%50\\%\\_a\\\\b%');
        expect(UserSearch.of('an').likePattern).toBe('%an%');
    });

    it('has no pattern without text', () => {
        expect(UserSearch.of(undefined).likePattern).toBeNull();
    });
});
