import { describe, expect, it } from 'vitest';
import { TaskCreatedEvent } from '../../tasks/contracts/task-created.event';
import { TaskAssignedOnCreateRule } from './task-assigned-on-create.rule';

const TASK_ID = '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a';

function taskCreated(
    assigneeId: string | null,
    creatorId = 'ivanov-id',
    initiatorId?: string,
): TaskCreatedEvent {
    return new TaskCreatedEvent({
        aggregateId: TASK_ID,
        title: 'Подготовить КП для клиента',
        creatorId,
        ...(initiatorId === undefined ? {} : { initiatorId }),
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

    it('names the initiator, who actually set the task, as the actor of task.assigned', () => {
        const [draft] = rule.apply(taskCreated('petrova-id', 'boris-id', 'ivanov-id'), 'ivanov');

        expect(draft.recipientId).toBe('petrova-id');
        expect(draft.actorId).toBe('ivanov-id');
        expect(draft.content.body).toBe('От ivanov: Подготовить КП для клиента');
    });

    it('notifies the creator as the assignee when someone else set the task on their behalf', () => {
        const event = taskCreated('boris-id', 'boris-id', 'ivanov-id');

        expect(rule.appliesTo(event)).toBe(true);
        expect(rule.apply(event, 'ivanov').map((draft) => draft.recipientId)).toEqual(['boris-id']);
    });

    it('drafts nothing when the initiator assigned the task to themselves', () => {
        expect(rule.apply(taskCreated('ivanov-id', 'boris-id', 'ivanov-id'), 'ivanov')).toEqual([]);
    });
});
