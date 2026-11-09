import { Module } from '@nestjs/common';
import { PostgresModule } from '../../../../database/postgres/postgres.module';
import { DealAuditRepositoryPort } from '../../domain/ports/deal-audit-repository.port';
import { DealAuditRepository } from './deal-audit-repository';

@Module({
    imports: [PostgresModule],
    providers: [{ provide: DealAuditRepositoryPort, useClass: DealAuditRepository }],
    exports: [DealAuditRepositoryPort],
})
export class AuditPersistenceModule {}
