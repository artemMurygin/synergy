import { Injectable } from '@nestjs/common';
import type { Actor } from '../domain/actor';
import { TaskAccessDeniedError } from '../domain/access-denied.error';
import { TaskNotFoundError } from '../domain/errors';
import { Clock } from '../domain/ports/clock.port';
import { TaskAccessPolicy } from '../domain/ports/task-access-policy.port';
import { TaskRepository } from '../domain/ports/task-repository.port';

@Injectable()
export class DeleteTaskUseCase {
    constructor(
        private readonly tasks: TaskRepository,
        private readonly policy: TaskAccessPolicy,
        private readonly clock: Clock,
    ) {}

    async execute(actor: Actor, id: string): Promise<void> {
        const task = await this.tasks.findById(id);
        if (task === null) throw new TaskNotFoundError(id);
        if (!this.policy.canDelete(actor, task)) {
            throw new TaskAccessDeniedError(actor.userId, 'delete', id);
        }
        task.softDelete(this.clock.now());
        await this.tasks.save(task);
    }
}
