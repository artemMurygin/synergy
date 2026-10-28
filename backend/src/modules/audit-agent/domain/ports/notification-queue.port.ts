import type { NotificationJob } from '../value-objects/notification-job.value-object';

export abstract class NotificationQueuePort {
    abstract enqueue(job: NotificationJob): Promise<void>;
}
