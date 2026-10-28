import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from '@prometheus-io/client';
import { AuditMetricsPort } from '../../domain/ports/audit-metrics.port';
import type { NotificationDeliveryStatus } from '../../domain/ports/audit-metrics.port';
import type { AuditVerdict } from '../../domain/value-objects/audit-verdict';
import {
    AUDIT_DEALS_METRIC,
    DEAL_SYNC_ENQUEUED_METRIC,
    NOTIFICATIONS_METRIC,
} from './audit-metrics.constants';

@Injectable()
export class AuditMetrics extends AuditMetricsPort {
    constructor(
        @InjectMetric(AUDIT_DEALS_METRIC) private readonly auditedDeals: Counter<'verdict'>,
        @InjectMetric(NOTIFICATIONS_METRIC) private readonly notifications: Counter<'status'>,
        @InjectMetric(DEAL_SYNC_ENQUEUED_METRIC) private readonly enqueuedDeals: Counter,
    ) {
        super();
    }

    recordAudit(verdict: AuditVerdict): void {
        this.auditedDeals.inc({ verdict });
    }

    recordNotification(status: NotificationDeliveryStatus): void {
        this.notifications.inc({ status });
    }

    recordDealsEnqueued(count: number): void {
        this.enqueuedDeals.inc(count);
    }
}
