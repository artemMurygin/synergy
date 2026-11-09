import type { Actor } from '../actor';
import type { Task } from '../task';

export abstract class TaskAccessPolicy {
    abstract canRead(actor: Actor, task: Task): boolean;
    abstract canUpdate(actor: Actor, task: Task): boolean;
    abstract canDelete(actor: Actor, task: Task): boolean;
}
