import type { Call } from '../entities/call.entity';
import type { CallId } from '../value-objects/call-id.value-object';

export interface CallFilter {
    callId?: CallId;
    projectId?: string;
    manager?: string;
    callDateFrom?: Date;
    callDateTo?: Date;
    totalScoreMin?: number;
    totalScoreMax?: number;
    tagId?: string;
    metricId?: string;
    /** Capped again by the repository at its hard maximum. */
    limit?: number;
    offset?: number;
}

export interface CallStats {
    callCount: number;
    averageScore: number | null;
    problematicShare: number;
}

export abstract class CallRepositoryPort {
    /** Resolves with the callIds that could not be persisted, so the caller can retry them. */
    abstract upsertMany(calls: Call[]): Promise<readonly CallId[]>;

    abstract findByFilter(filter: CallFilter): Promise<Call[]>;

    abstract countByFilter(filter: CallFilter): Promise<number>;

    abstract aggregateStats(filter: CallFilter): Promise<CallStats>;
}
