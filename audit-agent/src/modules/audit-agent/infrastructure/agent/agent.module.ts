import { Module } from '@nestjs/common';
import { AuditAgent } from '../../domain/audit/audit-agent';
import { LangchainAuditAgent } from './langchain-audit-agent';

@Module({
    providers: [{ provide: AuditAgent, useClass: LangchainAuditAgent }],
    exports: [AuditAgent],
})
export class AgentModule {}
