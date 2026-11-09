import { Injectable } from '@nestjs/common';
import type { Actor } from '../domain/actor';
import { TaskAccessPolicy } from '../domain/ports/task-access-policy.port';
import type { Task } from '../domain/task';

/** Current policy: every authenticated user may do everything. Replace when roles appear. */
@Injectable()
export class AllowAllTaskAccessPolicy extends TaskAccessPolicy {
    canRead(_actor: Actor, _task: Task): boolean {
        return true;
    }

    canUpdate(_actor: Actor, _task: Task): boolean {
        return true;
    }

    canDelete(_actor: Actor, _task: Task): boolean {
        return true;
    }
}
