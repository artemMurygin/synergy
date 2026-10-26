import { Module } from '@nestjs/common';
import { makeHistogramProvider } from '@willsoto/nestjs-prometheus';
import { AuditApplicationModule } from '../../application/audit/audit-application.module';
import { AUDIT_JOB_DURATION_METRIC, AuditProcessor } from './audit.processor';

const AUDIT_JOB_DURATION_BUCKETS_SECONDS = [0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600];

@Module({
    imports: [AuditApplicationModule],
    providers: [
        AuditProcessor,
        makeHistogramProvider({
            name: AUDIT_JOB_DURATION_METRIC,
            help: 'Audit job processing duration in seconds',
            labelNames: ['status'],
            buckets: AUDIT_JOB_DURATION_BUCKETS_SECONDS,
        }),
    ],
})
export class AuditQueueModule {}
