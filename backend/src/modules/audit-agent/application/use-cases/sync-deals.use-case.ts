import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditQueuePort } from '../../domain/ports/audit-queue.port';
import { AuditMetricsPort } from '../../domain/ports/audit-metrics.port';
import { CrmGatewayPort } from '../../domain/ports/crm-gateway.port';
import { SyncCursorRepositoryPort } from '../../domain/ports/sync-cursor-repository.port';

export const DEAL_SYNC_DEFAULT_WINDOW_MS = Symbol('DEAL_SYNC_DEFAULT_WINDOW_MS');

export interface SyncDealsResult {
    enqueued: number;
}

@Injectable()
export class SyncDealsUseCase {
    constructor(
        private readonly crmGateway: CrmGatewayPort,
        private readonly auditQueue: AuditQueuePort,
        private readonly cursorRepository: SyncCursorRepositoryPort,
        @Inject(DEAL_SYNC_DEFAULT_WINDOW_MS) private readonly defaultWindowMs: number,
        private readonly logger: PinoLogger,
        private readonly metrics: AuditMetricsPort,
    ) {
        this.logger.setContext(SyncDealsUseCase.name);
    }

    async execute(now: Date): Promise<SyncDealsResult> {
        const cursor = await this.cursorRepository.get();
        const from = cursor ?? new Date(now.getTime() - this.defaultWindowMs);
        const dealIds = await this.crmGateway.listUpdatedDealIds(from);
        for (const dealId of dealIds) {
            await this.auditQueue.enqueue(dealId);
        }
        await this.cursorRepository.set(now);
        this.metrics.recordDealsEnqueued(dealIds.length);
        this.logger.info(
            {
                from: from.toISOString(),
                enqueued: dealIds.length,
            },
            'Deal sync completed',
        );
        return { enqueued: dealIds.length };
    }
}
