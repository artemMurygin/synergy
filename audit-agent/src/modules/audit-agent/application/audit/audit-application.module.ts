import { Module } from '@nestjs/common';
import { AgentModule } from '../../infrastructure/agent/agent.module';
import { AuditPersistenceModule } from '../../infrastructure/persistence/audit-persistence.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { CreateAuditUseCase } from './create-audit.use-case';
import { GetAuditUseCase } from './get-audit.use-case';
import { ProcessAuditUseCase } from './process-audit.use-case';

@Module({
    imports: [AuditPersistenceModule, AgentModule, QueueModule],
    providers: [CreateAuditUseCase, GetAuditUseCase, ProcessAuditUseCase],
    exports: [CreateAuditUseCase, GetAuditUseCase, ProcessAuditUseCase],
})
export class AuditApplicationModule {}
