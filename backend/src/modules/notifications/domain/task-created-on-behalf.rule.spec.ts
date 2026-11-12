import { describe, expect, it } from 'vitest';
import { TaskCreatedEvent } from '../../tasks/contracts/task-created.event';
import { TaskCreatedOnBehalfRule } from './task-created-on-behalf.rule';

const TASK_ID = '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a';

function taskCreated(creatorId: string, initiatorId?: string): TaskCreatedEvent {
    return new TaskCreatedEvent({
        aggregateId: TASK_ID,
        title: 'Подготовить КП для клиента',
        creatorId,
        ...(initiatorId === undefined ? {} : { initiatorId }),
        assigneeId: 'petrova-id',
    });
}

describe('TaskCreatedOnBehalfRule', () => {
    const rule = new TaskCreatedOnBehalfRule();

    it('drafts task.created-on-behalf for the creator with the initiator as the actor', () => {
        const drafts = rule.apply(taskCreated('boris-id', 'ivanov-id'), 'ivanov');

        expect(drafts).toHaveLength(1);
        const [draft] = drafts;
        expect(draft.recipientId).toBe('boris-id');
        expect(draft.type).toBe('task.created-on-behalf');
        expect(draft.content.title).toBe('Задача поставлена от вашего имени');
        expect(draft.content.body).toBe('Поставил ivanov: Подготовить КП для клиента');
        expect(draft.target.type).toBe('task');
        expect(draft.target.id).toBe(TASK_ID);
        expect(draft.actorId).toBe('ivanov-id');
    });

    it('drafts nothing when the creator set the task themselves', () => {
        expect(rule.appliesTo(taskCreated('ivanov-id', 'ivanov-id'))).toBe(false);
        expect(rule.apply(taskCreated('ivanov-id', 'ivanov-id'), 'ivanov')).toEqual([]);
    });

    it('drafts nothing for an event written before the initiator existed', () => {
        expect(rule.appliesTo(taskCreated('ivanov-id'))).toBe(false);
    });
});
