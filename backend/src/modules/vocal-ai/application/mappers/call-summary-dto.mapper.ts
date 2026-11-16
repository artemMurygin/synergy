import { Call } from '../../domain/entities/call.entity';
import type { VocalAiCallSummaryDto } from '../../domain/ports/vocal-ai-gateway.port';

export function toCall(dto: VocalAiCallSummaryDto): Call {
    const call = Call.create({
        callId: dto.callId,
        projectId: dto.projectId,
        manager: dto.manager,
        client: dto.client,
        callType: dto.callType,
        callCreatedAt: dto.callCreatedAt,
        callCompletedAt: dto.callCompletedAt,
        scoredAt: dto.scoredAt,
        rescoredAt: dto.rescoredAt,
        durationSeconds: dto.durationSeconds,
        totalScore: dto.totalScore,
        maxScore: dto.maxScore,
    });
    call.replaceChildren(dto.metricScores, dto.tags, dto.summaries);
    return call;
}
