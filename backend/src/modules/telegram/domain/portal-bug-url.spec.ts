import { describe, expect, it } from 'vitest';
import { portalBugUrl } from './portal-bug-url';

describe('portalBugUrl', () => {
    it('builds the bug link from the base and id', () => {
        expect(portalBugUrl('https://portal.example.com', 'abc-123')).toBe(
            'https://portal.example.com/bugs/abc-123',
        );
    });

    it('encodes the id as a path segment', () => {
        expect(portalBugUrl('https://portal.example.com', 'a/b c?d')).toBe(
            'https://portal.example.com/bugs/a%2Fb%20c%3Fd',
        );
    });
});
