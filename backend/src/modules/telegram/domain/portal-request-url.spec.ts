import { describe, expect, it } from 'vitest';
import { portalRequestUrl } from './portal-request-url';

describe('portalRequestUrl', () => {
    it('builds the request link from the base and id', () => {
        expect(portalRequestUrl('https://portal.example.com', 'abc-123')).toBe(
            'https://portal.example.com/requests/abc-123',
        );
    });

    it('encodes the id as a path segment', () => {
        expect(portalRequestUrl('https://portal.example.com', 'a/b c?d')).toBe(
            'https://portal.example.com/requests/a%2Fb%20c%3Fd',
        );
    });
});
