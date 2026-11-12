import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { DraftOrigin } from './draft-origin';
import { DraftTaskItem } from './draft-task-item';
import { TaskBatchDraft } from './task-batch-draft';
import {
    DraftAlreadyUsedError,
    EmptyTaskBatchError,
    MAX_DRAFT_TASKS,
    TaskBatchErrorCode,
    TooManyDraftTasksError,
} from './task-batch-errors';
import { TaskBatchResult } from './task-batch-result';

const OWNER = 'owner-1';
const THREAD = 'thread-1';
const NOW = new Date('2026-03-01T10:00:00Z');

function item(title = 'Подготовить КП'): DraftTaskItem {
    return DraftTaskItem.of({ title, creatorId: OWNER });
}

function draft(count = 2, origin: DraftOrigin | null = null): TaskBatchDraft {
    return TaskBatchDraft.create({
        id: 'draft-1',
        ownerId: OWNER,
        threadId: THREAD,
        items: Array.from({ length: count }, (_, i) => item(`Задача ${String(i + 1)}`)),
        origin,
        now: NOW,
    });
}

describe('DraftTaskItem', () => {
    it('trims the title, fills defaults and freezes the item', () => {
        const value = DraftTaskItem.of({
            title: '  Созвон с клиентом ',
            creatorId: OWNER,
            watcherIds: ['w1', 'w1', 'w2'],
            sourceNote: '  ',
        });

        expect(value.title.value).toBe('Созвон с клиентом');
        expect(value.description).toBe('');
        expect(value.deadline).toBeNull();
        expect(value.assigneeId).toBeNull();
        expect(value.watcherIds).toEqual(['w1', 'w2']);
        expect(value.sourceNote).toBeNull();
        expect(Object.isFrozen(value)).toBe(true);
    });

    it('rejects an empty title and a too long description', () => {
        expect(() => DraftTaskItem.of({ title: ' ', creatorId: OWNER })).toThrow(
            ArgumentInvalidError,
        );
        expect(() =>
            DraftTaskItem.of({ title: 'T', creatorId: OWNER, description: 'x'.repeat(10_001) }),
        ).toThrow(ArgumentInvalidError);
    });

    it('requires a creator', () => {
        expect(() => DraftTaskItem.of({ title: 'T', creatorId: ' ' })).toThrow(
            ArgumentInvalidError,
        );
    });
});

describe('DraftOrigin', () => {
    it('builds a meeting origin and strips the extension of the recording', () => {
        const origin = DraftOrigin.meeting({ fileId: 'f1', recordingName: 'Планёрка 01.03.m4a' });

        expect(origin).toEqual({
            kind: 'meeting',
            fileId: 'f1',
            recordingName: 'Планёрка 01.03.m4a',
        });
        expect(DraftOrigin.recordingTitle(origin)).toBe('Планёрка 01.03');
        expect(DraftOrigin.recordingTitle({ ...origin, recordingName: 'без расширения' })).toBe(
            'без расширения',
        );
    });

    it('rejects a blank file id or recording name', () => {
        expect(() => DraftOrigin.meeting({ fileId: '', recordingName: 'a.mp3' })).toThrow(
            ArgumentInvalidError,
        );
        expect(() => DraftOrigin.meeting({ fileId: 'f1', recordingName: '  ' })).toThrow(
            ArgumentInvalidError,
        );
    });
});

describe('TaskBatchResult', () => {
    it('counts created and failed items', () => {
        const result = TaskBatchResult.of([
            { index: 1, status: 'created', taskId: 't1' },
            { index: 2, status: 'failed', reason: 'исполнитель отключён' },
        ]);

        expect(result.createdCount).toBe(1);
        expect(result.failedCount).toBe(1);
        expect(result.items).toHaveLength(2);
    });

    it('rejects duplicated or non-positive indexes', () => {
        expect(() =>
            TaskBatchResult.of([
                { index: 1, status: 'created', taskId: 't1' },
                { index: 1, status: 'created', taskId: 't2' },
            ]),
        ).toThrow(ArgumentInvalidError);
        expect(() => TaskBatchResult.of([{ index: 0, status: 'created', taskId: 't1' }])).toThrow(
            ArgumentInvalidError,
        );
    });
});

describe('TaskBatchDraft', () => {
    it('is created in the draft status with its items and origin', () => {
        const origin = DraftOrigin.meeting({ fileId: 'f1', recordingName: 'rec.mp3' });
        const value = draft(3, origin);

        expect(value.status).toBe('draft');
        expect(value.items).toHaveLength(3);
        expect(value.origin).toEqual(origin);
        expect(value.result).toBeNull();
        expect(value.ownerId).toBe(OWNER);
        expect(value.threadId).toBe(THREAD);
    });

    it('accepts from 1 to 30 tasks', () => {
        expect(draft(1).items).toHaveLength(1);
        expect(draft(MAX_DRAFT_TASKS).items).toHaveLength(30);
        expect(() => draft(0)).toThrow(EmptyTaskBatchError);
        expect(() => draft(MAX_DRAFT_TASKS + 1)).toThrow(TooManyDraftTasksError);
    });

    it('gives its items once: a repeated consume throws DraftAlreadyUsedError', () => {
        const value = draft(2);

        expect(value.consume().map((i) => i.title.value)).toEqual(['Задача 1', 'Задача 2']);
        expect(value.status).toBe('consumed');
        expect(() => value.consume()).toThrow(DraftAlreadyUsedError);
    });

    it('cannot be consumed after being superseded', () => {
        const value = draft(1);
        value.supersede();

        expect(value.status).toBe('superseded');
        const error = (() => {
            try {
                value.consume();
            } catch (caught) {
                return caught;
            }
            return null;
        })();
        expect(error).toBeInstanceOf(DraftAlreadyUsedError);
        expect((error as DraftAlreadyUsedError).code).toBe(TaskBatchErrorCode.DraftAlreadyUsed);
        expect((error as DraftAlreadyUsedError).status).toBe('superseded');
    });

    it('records the result only after being consumed', () => {
        const value = draft(1);
        const result = TaskBatchResult.of([{ index: 1, status: 'created', taskId: 't1' }]);

        expect(() => {
            value.recordResult(result);
        }).toThrow(ArgumentInvalidError);
        value.consume();
        value.recordResult(result);
        expect(value.result).toBe(result);
    });

    it('restores a stored draft as is', () => {
        const restored = TaskBatchDraft.restore({
            id: 'd2',
            ownerId: OWNER,
            threadId: THREAD,
            items: [item()],
            origin: null,
            status: 'consumed',
            result: null,
            createdAt: NOW,
        });

        expect(restored.status).toBe('consumed');
        expect(() => restored.consume()).toThrow(DraftAlreadyUsedError);
    });
});
