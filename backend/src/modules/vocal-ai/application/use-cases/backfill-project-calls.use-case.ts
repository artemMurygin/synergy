import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CallRepositoryPort } from '../../domain/ports/call-repository.port';
import { SyncCursorRepositoryPort } from '../../domain/ports/sync-cursor-repository.port';
import { VocalAiGatewayPort } from '../../domain/ports/vocal-ai-gateway.port';
import type { CallId } from '../../domain/value-objects/call-id.value-object';
import { SyncWindow } from '../../domain/value-objects/sync-window.value-object';
import { CallPersistFailureTracker } from '../call-persist-failure-tracker';
import { toCall } from '../mappers/call-summary-dto.mapper';

export const BACKFILL_PAGE_WINDOW_MS = Symbol('BACKFILL_PAGE_WINDOW_MS');

export interface BackfillResult {
    syncedCallsCount: number;
}

@Injectable()
export class BackfillProjectCallsUseCase {
    private readonly failureTracker = new CallPersistFailureTracker();

    constructor(
        private readonly vocalAiGateway: VocalAiGatewayPort,
        private readonly callRepository: CallRepositoryPort,
        private readonly cursorRepository: SyncCursorRepositoryPort,
        @Inject(BACKFILL_PAGE_WINDOW_MS) private readonly pageWindowMs: number,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(BackfillProjectCallsUseCase.name);
    }

    /**
     * Advances the cursor to the end of each page right after that page is upserted, instead of
     * once at the very end: a failure partway through leaves the cursor at the last completed
     * page, so the next cycle resumes as a normal incremental sync from there instead of
     * restarting the whole history from the epoch.
     */
    async execute(projectId: string): Promise<BackfillResult> {
        const now = new Date();
        let syncedCallsCount = 0;
        let pageFromAt = new Date(0);

        while (pageFromAt.getTime() < now.getTime()) {
            const pageToAt = new Date(
                Math.min(pageFromAt.getTime() + this.pageWindowMs, now.getTime()),
            );
            const window = new SyncWindow({ fromAt: pageFromAt, toAt: pageToAt });
            const pageDtos = await this.vocalAiGateway.listCalls(projectId, window, 'callWindow');

            let failedCallIds: readonly CallId[] = [];
            if (pageDtos.length > 0) {
                failedCallIds = await this.callRepository.upsertMany(pageDtos.map(toCall));
                syncedCallsCount += pageDtos.length - failedCallIds.length;
            }

            const { blockingCallIds, quarantinedCallIds } = this.failureTracker.partition(
                pageDtos.map((dto) => dto.callId),
                failedCallIds,
            );

            if (quarantinedCallIds.length > 0) {
                this.logger.error(
                    {
                        projectId,
                        quarantinedCallIds: quarantinedCallIds.map((callId) => callId.value),
                    },
                    'Backfill page permanently failed to persist calls, skipping them so paging keeps advancing',
                );
            }

            if (blockingCallIds.length > 0) {
                this.logger.warn(
                    {
                        projectId,
                        failedCallIds: blockingCallIds.map((callId) => callId.value),
                    },
                    'Backfill page left calls unsaved, stopping so it is retried next cycle',
                );
                break;
            }

            await this.cursorRepository.set(projectId, pageToAt);
            pageFromAt = pageToAt;
        }

        this.logger.info({ projectId, syncedCallsCount }, 'Project backfill completed');
        return { syncedCallsCount };
    }
}
