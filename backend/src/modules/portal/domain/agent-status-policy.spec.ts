import { describe, expect, it } from 'vitest';
import { AGENT_STATUS_LABELS } from '../contracts/agent-status-labels';
import { AgentStatusPolicy } from './agent-status-policy';
import type { SkillStatus } from './skill-status';

const T = new Date('2026-01-01T10:00:00Z');

function skill(
    status: SkillStatus,
    launchedAt: Date | null,
): { status: SkillStatus; launchedAt: Date | null } {
    return { status, launchedAt };
}

describe('AgentStatusPolicy', () => {
    it('is in_development for an empty list', () => {
        expect(AgentStatusPolicy.statusOf([])).toEqual({
            code: 'in_development',
            label: 'В разработке',
        });
    });

    it('is in_development when no skill has ever launched', () => {
        const status = AgentStatusPolicy.statusOf([
            skill('planned', null),
            skill('in_dev', null),
            skill('testing', null),
            skill('rework', null),
        ]);
        expect(status.code).toBe('in_development');
    });

    it.each(['launched', 'rework', 'testing'] as const)(
        'is working when a skill has launchedAt and status %s',
        (status) => {
            expect(AgentStatusPolicy.statusOf([skill('planned', null), skill(status, T)])).toEqual({
                code: 'working',
                label: 'Работает',
            });
        },
    );

    it('has labels', () => {
        expect(AGENT_STATUS_LABELS).toEqual({
            working: 'Работает',
            in_development: 'В разработке',
        });
    });
});
