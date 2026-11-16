import { Injectable } from '@nestjs/common';
import type { CallMetricScore } from '../../domain/entities/call-metric-score.entity';
import type { CallSummary } from '../../domain/entities/call-summary.entity';
import type { CallTag } from '../../domain/entities/call-tag.entity';
import { CallRepositoryPort } from '../../domain/ports/call-repository.port';
import { CallId } from '../../domain/value-objects/call-id.value-object';
import { CallNotFoundError } from '../../domain/errors';

export interface CallDetailView {
    callId: CallId;
    projectId: string;
    manager: string | null;
    client: string | null;
    callType: string | null;
    totalScore: number | null;
    maxScore: number | null;
    metricScores: readonly CallMetricScore[];
    tags: readonly CallTag[];
    summaries: readonly CallSummary[];
}

@Injectable()
export class GetCallDetailUseCase {
    constructor(private readonly callRepository: CallRepositoryPort) {}

    async execute(callId: CallId): Promise<CallDetailView> {
        const calls = await this.callRepository.findByFilter({ callId });
        if (calls.length === 0) {
            throw new CallNotFoundError(callId);
        }
        const [call] = calls;

        return {
            callId: call.callId,
            projectId: call.projectId,
            manager: call.manager,
            client: call.client,
            callType: call.callType,
            totalScore: call.totalScore,
            maxScore: call.maxScore,
            metricScores: call.metricScores,
            tags: call.tags,
            summaries: call.summaries,
        };
    }
}
