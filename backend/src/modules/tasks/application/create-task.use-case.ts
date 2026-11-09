import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Actor } from '../domain/actor';
import { Clock } from '../domain/ports/clock.port';
import { TaskRepository } from '../domain/ports/task-repository.port';
import { UserDirectory } from '../domain/ports/user-directory.port';
import { Task } from '../domain/task';
import { TaskTitle } from '../domain/task-title';
import { assertActiveUsers, toTaskView, type TaskView } from './task-view';

export interface CreateTaskInput {
    title: string;
    description?: string;
    deadline?: Date | null;
    assigneeId?: string | null;
    watcherIds?: readonly string[];
}

@Injectable()
export class CreateTaskUseCase {
    constructor(
        private readonly tasks: TaskRepository,
        private readonly users: UserDirectory,
        private readonly clock: Clock,
    ) {}

    async execute(actor: Actor, input: CreateTaskInput): Promise<TaskView> {
        const title = TaskTitle.of(input.title);
        await assertActiveUsers(this.users, [input.assigneeId, ...(input.watcherIds ?? [])]);
        const task = Task.create({
            id: randomUUID(),
            title,
            description: input.description,
            deadline: input.deadline,
            creatorId: actor.userId,
            assigneeId: input.assigneeId,
            watcherIds: input.watcherIds,
            now: this.clock.now(),
        });
        await this.tasks.save(task);
        return toTaskView(task, this.users);
    }
}
