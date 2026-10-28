import { Module } from '@nestjs/common';
import { PostgresModule } from '../../../../database/postgres/postgres.module';
import { DealAuditRepositoryPort } from '../../domain/ports/deal-audit-repository.port';
import { EmployeeRepositoryPort } from '../../domain/ports/employee-repository.port';
import { DealAuditRepository } from './deal-audit-repository';
import { EmployeeRepository } from './employee-repository';

@Module({
    imports: [PostgresModule],
    providers: [
        { provide: EmployeeRepositoryPort, useClass: EmployeeRepository },
        { provide: DealAuditRepositoryPort, useClass: DealAuditRepository },
    ],
    exports: [EmployeeRepositoryPort, DealAuditRepositoryPort],
})
export class AuditPersistenceModule {}
