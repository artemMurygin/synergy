import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { AgentGuide } from './agent-guide';

const now = new Date('2026-01-01T10:00:00Z');

describe('AgentGuide.write', () => {
    it('builds a guide with trimmed body, author and time', () => {
        const guide = AgentGuide.write({ agentId: 'a1', body: ' # Hi \n', by: 'u1', now });
        expect(guide).not.toBeNull();
        expect(guide?.agentId).toBe('a1');
        expect(guide?.body.value).toBe('# Hi');
        expect(guide?.updatedBy).toBe('u1');
        expect(guide?.updatedAt).toBe(now);
    });

    it('returns null for an empty body (means deletion)', () => {
        expect(AgentGuide.write({ agentId: 'a1', body: '  \n', by: 'u1', now })).toBeNull();
    });

    it('rejects a body over the limit', () => {
        expect(() =>
            AgentGuide.write({ agentId: 'a1', body: 'a'.repeat(50001), by: 'u1', now }),
        ).toThrow(ArgumentInvalidError);
    });
});
