import type { AuditVerdict } from '../value-objects/audit-verdict';

export type NotificationDeliveryStatus = 'sent' | 'skipped' | 'failed';

export abstract class AuditMetricsPort {
    abstract recordAudit(verdict: AuditVerdict): void;

    abstract recordNotification(status: NotificationDeliveryStatus): void;

    abstract recordDealsEnqueued(count: number): void;
}
