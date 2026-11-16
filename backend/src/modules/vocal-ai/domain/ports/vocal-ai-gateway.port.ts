import type { CallId } from '../value-objects/call-id.value-object';
import type { SyncWindow } from '../value-objects/sync-window.value-object';
import type { CallMetricScore } from '../entities/call-metric-score.entity';
import type { CallSummary } from '../entities/call-summary.entity';
import type { CallTag } from '../entities/call-tag.entity';
import type { CallTranscriptLine } from '../entities/call-transcript-line.entity';

export interface VocalAiLoginCredentials {
    username: string;
    password: string;
}

export interface VocalAiSession {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
}

export interface VocalAiCallSummaryDto {
    callId: CallId;
    projectId: string;
    manager: string | null;
    client: string | null;
    callType: string | null;
    callCreatedAt: Date | null;
    callCompletedAt: Date | null;
    scoredAt: Date | null;
    rescoredAt: Date | null;
    durationSeconds: number | null;
    totalScore: number | null;
    maxScore: number | null;
    metricScores: CallMetricScore[];
    tags: CallTag[];
    summaries: CallSummary[];
}

export interface VocalAiCallDetailDto extends VocalAiCallSummaryDto {
    transcriptLines: CallTranscriptLine[];
}

/** Which date the window filters by: when the call happened, or when it was scored/rescored. */
export type VocalAiListCallsWindowKind = 'callWindow' | 'scoreWindow';

export abstract class VocalAiGatewayPort {
    abstract login(credentials: VocalAiLoginCredentials): Promise<VocalAiSession>;

    abstract refreshToken(session: VocalAiSession): Promise<VocalAiSession>;

    abstract listCalls(
        projectId: string,
        window: SyncWindow,
        windowKind: VocalAiListCallsWindowKind,
    ): Promise<VocalAiCallSummaryDto[]>;

    abstract getCall(callId: CallId, projectId: string): Promise<VocalAiCallDetailDto>;
}
