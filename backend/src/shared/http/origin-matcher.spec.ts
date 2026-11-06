import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from './origin-matcher';

describe('isOriginAllowed', () => {
    it('accepts an exact match', () => {
        expect(isOriginAllowed('chrome-extension://abc', ['chrome-extension://abc'])).toBe(true);
    });

    it('rejects an origin that is not listed', () => {
        expect(isOriginAllowed('https://evil.example', ['chrome-extension://abc'])).toBe(false);
    });

    it('accepts any host of the scheme for a scheme wildcard', () => {
        expect(isOriginAllowed('chrome-extension://facoik', ['chrome-extension://*'])).toBe(true);
        expect(isOriginAllowed('chrome-extension://other', ['chrome-extension://*'])).toBe(true);
    });

    it('does not let a scheme wildcard match another scheme', () => {
        expect(isOriginAllowed('https://evil.example', ['chrome-extension://*'])).toBe(false);
        expect(isOriginAllowed('moz-extension://abc', ['chrome-extension://*'])).toBe(false);
    });

    it('does not accept an empty host or a path behind the wildcard', () => {
        expect(isOriginAllowed('chrome-extension://', ['chrome-extension://*'])).toBe(false);
        expect(isOriginAllowed('chrome-extension://abc/path', ['chrome-extension://*'])).toBe(
            false,
        );
    });

    it('rejects everything for an empty list', () => {
        expect(isOriginAllowed('chrome-extension://abc', [])).toBe(false);
    });
});
