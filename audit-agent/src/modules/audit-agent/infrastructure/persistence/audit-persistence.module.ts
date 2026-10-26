import { Module } from '@nestjs/common';
import { PostgresModule } from '../../../../database/postgres/postgres.module';
import { AuditRunRepository } from '../../domain/audit/audit-run.repository';
import { PostgresAuditRunRepository } from './postgres-audit-run.repository';

@Module({
    imports: [PostgresModule],
    providers: [{ provide: AuditRunRepository, useClass: PostgresAuditRunRepository }],
    exports: [AuditRunRepository],
})
export class AuditPersistenceModule {}
