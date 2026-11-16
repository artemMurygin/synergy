import { describe, expect, it } from 'vitest';
import { BugAccessPolicy } from './bug-access-policy';

describe('BugAccessPolicy.canView', () => {
    const bug = { authorId: 'u1' };

    it('author can view', () => {
        expect(BugAccessPolicy.canView(bug, { id: 'u1', roles: [] })).toBe(true);
    });

    it('developer can view any bug', () => {
        expect(BugAccessPolicy.canView(bug, { id: 'u2', roles: ['developer'] })).toBe(true);
    });

    it('another user cannot', () => {
        expect(BugAccessPolicy.canView(bug, { id: 'u2', roles: ['admin'] })).toBe(false);
    });
});
