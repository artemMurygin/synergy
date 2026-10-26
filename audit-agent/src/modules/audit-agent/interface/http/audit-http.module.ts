import { Module } from '@nestjs/common';
import { AuditApplicationModule } from '../../application/audit/audit-application.module';
import { AuditController } from './audit.controller';

@Module({ imports: [AuditApplicationModule], controllers: [AuditController] })
export class AuditHttpModule {}
