import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Call } from '../../domain/entities/call.entity';
import { CallRepositoryPort } from '../../domain/ports/call-repository.port';
import { SyncCursorRepositoryPort } from '../../domain/ports/sync-cursor-repository.port';
import { VocalAiGatewayPort } from '../../domain/ports/vocal-ai-gateway.port';
import { SyncWindow } from '../../domain/value-objects/sync-window.value-object';
import { toCall } from '../mappers/call-summary-dto.mapper';
import { BackfillProjectCallsUseCase } from './backfill-project-calls.use-case';

export interface SyncResult {
    syncedCallsCount: number;
}

type BackfillCallsExecutor = Pick<BackfillProjectCallsUseCase, 'execute'>;

@Injectable()
export class SyncProjectCallsUseCase {
    constructor(
        private readonly vocalAiGateway: VocalAiGatewayPort,
        private readonly callRepository: CallRepositoryPort,
        private readonly cursorRepository: SyncCursorRepositoryPort,
        private readonly backfillUseCase: BackfillCallsExecutor,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(SyncProjectCallsUseCase.name);
    }

    async execute(projectId: string, now: Date): Promise<SyncResult> {
        const lastSyncedAt = await this.cursorRepository.get(projectId);
        if (lastSyncedAt === null) {
            return this.backfillUseCase.execute(projectId);
        }

        const window = new SyncWindow({ fromAt: lastSyncedAt, toAt: now });
        const [callWindowDtos, scoreWindowDtos] = await Promise.all([
            this.vocalAiGateway.listCalls(projectId, window),
            this.vocalAiGateway.listCalls(projectId, window),
        ]);

        const calls = deduplicateByCallId([...callWindowDtos, ...scoreWindowDtos].map(toCall));
        await this.callRepository.upsertMany(calls);
        await this.cursorRepository.set(projectId, now);

        this.logger.info(
            { projectId, syncedCallsCount: calls.length },
            'Project incremental sync completed',
        );
        return { syncedCallsCount: calls.length };
    }
}

function deduplicateByCallId(calls: readonly Call[]): Call[] {
    const lastByCallId = new Map<number, Call>();
    for (const call of calls) {
        lastByCallId.set(call.callId.value, call);
    }
    return [...lastByCallId.values()];
}
