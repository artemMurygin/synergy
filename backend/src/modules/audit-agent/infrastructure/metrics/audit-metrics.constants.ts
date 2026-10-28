import { makeCounterProvider } from '@willsoto/nestjs-prometheus';

export const AUDIT_DEALS_METRIC = 'audit_deals_total';
export const NOTIFICATIONS_METRIC = 'notifications_total';
export const DEAL_SYNC_ENQUEUED_METRIC = 'deal_sync_enqueued_total';

export const auditMetricProviders = [
    makeCounterProvider({
        name: AUDIT_DEALS_METRIC,
        help: 'Audited deals by verdict',
        labelNames: ['verdict'],
    }),
    makeCounterProvider({
        name: NOTIFICATIONS_METRIC,
        help: 'Notification delivery attempts by status',
        labelNames: ['status'],
    }),
    makeCounterProvider({
        name: DEAL_SYNC_ENQUEUED_METRIC,
        help: 'Deals enqueued for audit by the deal sync',
    }),
];
