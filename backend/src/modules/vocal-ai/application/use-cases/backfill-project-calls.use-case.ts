import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CallRepositoryPort } from '../../domain/ports/call-repository.port';
import { SyncCursorRepositoryPort } from '../../domain/ports/sync-cursor-repository.port';
import { VocalAiGatewayPort } from '../../domain/ports/vocal-ai-gateway.port';
import { SyncWindow } from '../../domain/value-objects/sync-window.value-object';
import { toCall } from '../mappers/call-summary-dto.mapper';

export const BACKFILL_PAGE_WINDOW_MS = Symbol('BACKFILL_PAGE_WINDOW_MS');

export interface BackfillResult {
    syncedCallsCount: number;
}

@Injectable()
export class BackfillProjectCallsUseCase {
    constructor(
        private readonly vocalAiGateway: VocalAiGatewayPort,
        private readonly callRepository: CallRepositoryPort,
        private readonly cursorRepository: SyncCursorRepositoryPort,
        @Inject(BACKFILL_PAGE_WINDOW_MS) private readonly pageWindowMs: number,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(BackfillProjectCallsUseCase.name);
    }

    async execute(projectId: string): Promise<BackfillResult> {
        const now = new Date();
        let syncedCallsCount = 0;
        let pageFromAt = new Date(0);

        while (pageFromAt.getTime() < now.getTime()) {
            const pageToAt = new Date(
                Math.min(pageFromAt.getTime() + this.pageWindowMs, now.getTime()),
            );
            const window = new SyncWindow({ fromAt: pageFromAt, toAt: pageToAt });
            const pageDtos = await this.vocalAiGateway.listCalls(projectId, window);

            if (pageDtos.length > 0) {
                await this.callRepository.upsertMany(pageDtos.map(toCall));
                syncedCallsCount += pageDtos.length;
            }

            pageFromAt = pageToAt;
        }

        await this.cursorRepository.set(projectId, now);
        this.logger.info({ projectId, syncedCallsCount }, 'Project backfill completed');
        return { syncedCallsCount };
    }
}
