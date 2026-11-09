import { BaseError } from '../../../shared/errors';

export const TASK_ACCESS_DENIED = 'TASK_ACCESS_DENIED';

/** Raised when TaskAccessPolicy refuses an action. The allow-all policy never does. */
export class TaskAccessDeniedError extends BaseError {
    readonly code = TASK_ACCESS_DENIED;

    constructor(
        readonly userId: string,
        readonly action: 'read' | 'update' | 'delete',
        readonly taskId: string,
    ) {
        super(`User ${userId} may not ${action} task ${taskId}`);
    }
}
