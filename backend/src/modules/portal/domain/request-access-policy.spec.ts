import { describe, expect, it } from 'vitest';
import { RequestAccessPolicy } from './request-access-policy';

describe('RequestAccessPolicy.canView', () => {
    const request = { authorId: 'u1' };

    it('allows the request author', () => {
        expect(RequestAccessPolicy.canView(request, { id: 'u1', roles: [] })).toBe(true);
    });

    it('allows a developer', () => {
        expect(RequestAccessPolicy.canView(request, { id: 'u2', roles: ['developer'] })).toBe(true);
    });

    it('denies others', () => {
        expect(RequestAccessPolicy.canView(request, { id: 'u2', roles: [] })).toBe(false);
        expect(RequestAccessPolicy.canView(request, { id: 'u2', roles: ['manager'] })).toBe(false);
    });
});
