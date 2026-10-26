export abstract class AuditQueue {
    abstract enqueue(runId: string): Promise<void>;
}
