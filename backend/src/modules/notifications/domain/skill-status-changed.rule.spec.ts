import { describe, expect, it } from 'vitest';
import type { LinkedRequestSnapshot } from '../../portal/contracts/linked-request-snapshot';
import { SkillStatusChangedEvent } from '../../portal/contracts/skill-status-changed.event';
import type { SkillStatus } from '../../portal/domain/skill-status';
import { SkillStatusChangedRule } from './skill-status-changed.rule';

const SKILL_ID = '9c1d2e3f-0a1b-4c5d-8e6f-7a8b9c0d1e2f';

function changed(
    linked: LinkedRequestSnapshot[],
    to: SkillStatus = 'in_dev',
): SkillStatusChangedEvent {
    return new SkillStatusChangedEvent({
        aggregateId: SKILL_ID,
        skillName: 'Сверка актов',
        from: 'planned',
        to,
        changedBy: 'dev-id',
        linked,
        metadata: { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'dev-id' },
    });
}

describe('SkillStatusChangedRule', () => {
    const rule = new SkillStatusChangedRule();

    it('drafts one request.status-changed notification per linked request', () => {
        const drafts = rule.apply(
            changed([
                { requestId: 'req-1', authorId: 'anna-id', title: 'Сверка за март' },
                { requestId: 'req-2', authorId: 'boris-id', title: 'Сверка за июнь' },
            ]),
        );

        expect(drafts).toHaveLength(2);
        expect(drafts.map((d) => [d.recipientId, d.target.type, d.target.id])).toEqual([
            ['anna-id', 'request', 'req-1'],
            ['boris-id', 'request', 'req-2'],
        ]);
        const [first] = drafts;
        expect(first.type).toBe('request.status-changed');
        expect(`${first.content.title} ${first.content.body}`).toContain('Сверка за март');
        expect(first.content.body).toContain('Сверка актов');
        expect(first.content.body).toContain('В разработке');
        expect(first.actorId).toBe('dev-id');
    });

    it('drafts two notifications for two requests of the same author', () => {
        const drafts = rule.apply(
            changed([
                { requestId: 'req-1', authorId: 'anna-id', title: 'Первая' },
                { requestId: 'req-2', authorId: 'anna-id', title: 'Вторая' },
            ]),
        );

        expect(drafts.map((d) => d.target.id)).toEqual(['req-1', 'req-2']);
    });

    it('skips requests whose author is the developer who changed the status', () => {
        const drafts = rule.apply(
            changed([
                { requestId: 'req-1', authorId: 'dev-id', title: 'Своя' },
                { requestId: 'req-2', authorId: 'anna-id', title: 'Чужая' },
            ]),
        );

        expect(drafts.map((d) => d.target.id)).toEqual(['req-2']);
    });

    it('drafts nothing for an empty snapshot', () => {
        expect(rule.apply(changed([]))).toEqual([]);
    });

    it('states the new status in Russian', () => {
        const [draft] = rule.apply(
            changed([{ requestId: 'req-1', authorId: 'anna-id', title: 'Идея' }], 'launched'),
        );

        expect(draft.content.body).toContain('Запущено');
    });
});
