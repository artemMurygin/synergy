import { Module } from '@nestjs/common';
import { AuditApplicationModule } from '../../application/audit/audit-application.module';
import { AuditProcessor } from './audit.processor';

@Module({ imports: [AuditApplicationModule], providers: [AuditProcessor] })
export class AuditQueueModule {}
