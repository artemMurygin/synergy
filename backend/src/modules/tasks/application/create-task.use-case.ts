import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
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
    /**
     * Постановщик, если он не совпадает с инициатором. Задаётся только при создании агентом
     * по подтверждению пользователя; HTTP его не передаёт. По умолчанию — `actor`.
     */
    creatorId?: string;
}

@Injectable()
export class CreateTaskUseCase {
    constructor(
        private readonly tasks: TaskRepository,
        private readonly users: UserDirectory,
        private readonly clock: Clock,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
    ) {}

    /** `actor` — инициатор: аутентифицированный пользователь, который фактически создаёт задачу. */
    async execute(actor: Actor, input: CreateTaskInput): Promise<TaskView> {
        const title = TaskTitle.of(input.title);
        await assertActiveUsers(this.users, [
            input.creatorId,
            input.assigneeId,
            ...(input.watcherIds ?? []),
        ]);
        const task = Task.create({
            id: randomUUID(),
            title,
            description: input.description,
            deadline: input.deadline,
            creatorId: input.creatorId ?? actor.userId,
            initiatorId: actor.userId,
            assigneeId: input.assigneeId,
            watcherIds: input.watcherIds,
            now: this.clock.now(),
        });
        await this.transactions.run(async () => {
            await this.tasks.save(task);
            await this.events.publish(task.pullDomainEvents());
        });
        return toTaskView(task, this.users);
    }
}
