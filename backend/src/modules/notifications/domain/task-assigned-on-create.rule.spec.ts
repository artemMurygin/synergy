import { describe, expect, it } from 'vitest';
import { TaskCreatedEvent } from '../../tasks/contracts/task-created.event';
import { TaskAssignedOnCreateRule } from './task-assigned-on-create.rule';

const TASK_ID = '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a';

function taskCreated(assigneeId: string | null, creatorId = 'ivanov-id'): TaskCreatedEvent {
    return new TaskCreatedEvent({
        aggregateId: TASK_ID,
        title: 'Подготовить КП для клиента',
        creatorId,
        assigneeId,
        metadata: { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: creatorId },
    });
}

describe('TaskAssignedOnCreateRule', () => {
    const rule = new TaskAssignedOnCreateRule();

    it('drafts one task.assigned notification for an assignee other than the creator', () => {
        const drafts = rule.apply(taskCreated('petrova-id'), 'ivanov');

        expect(drafts).toHaveLength(1);
        const [draft] = drafts;
        expect(draft.recipientId).toBe('petrova-id');
        expect(draft.type).toBe('task.assigned');
        expect(draft.content.title).toBe('Вам назначена задача');
        expect(draft.content.body).toBe('От ivanov: Подготовить КП для клиента');
        expect(draft.target.type).toBe('task');
        expect(draft.target.id).toBe(TASK_ID);
        expect(draft.actorId).toBe('ivanov-id');
    });

    it('drafts nothing when the creator assigned the task to themselves', () => {
        expect(rule.apply(taskCreated('ivanov-id'), 'ivanov')).toEqual([]);
    });

    it('drafts nothing for a task without an assignee', () => {
        expect(rule.apply(taskCreated(null), 'ivanov')).toEqual([]);
    });

    it('applies only to a task assigned to someone other than the creator', () => {
        expect(rule.appliesTo(taskCreated('petrova-id'))).toBe(true);
        expect(rule.appliesTo(taskCreated('ivanov-id'))).toBe(false);
        expect(rule.appliesTo(taskCreated(null))).toBe(false);
    });
});
