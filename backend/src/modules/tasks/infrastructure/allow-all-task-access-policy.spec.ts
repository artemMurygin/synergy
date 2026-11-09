import { describe, expect, it } from 'vitest';
import { Actor } from '../domain/actor';
import { Task } from '../domain/task';
import { TaskTitle } from '../domain/task-title';
import { AllowAllTaskAccessPolicy } from './allow-all-task-access-policy';

describe('AllowAllTaskAccessPolicy', () => {
    it('lets any actor read, update and delete any task', () => {
        const policy = new AllowAllTaskAccessPolicy();
        const stranger = Actor.of('stranger');
        const task = Task.create({
            id: 't1',
            title: TaskTitle.of('Отчёт'),
            creatorId: 'creator',
            now: new Date(),
        });

        expect(policy.canRead(stranger, task)).toBe(true);
        expect(policy.canUpdate(stranger, task)).toBe(true);
        expect(policy.canDelete(stranger, task)).toBe(true);
    });
});
