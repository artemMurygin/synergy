import type { DealId } from '../value-objects/deal-id.value-object';

export abstract class AuditQueuePort {
    abstract enqueue(dealId: DealId): Promise<void>;
}
