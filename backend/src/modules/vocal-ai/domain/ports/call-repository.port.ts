import type { Call } from '../entities/call.entity';

export interface CallFilter {
    projectId?: string;
    manager?: string;
    callDateFrom?: Date;
    callDateTo?: Date;
    totalScoreMin?: number;
    totalScoreMax?: number;
    tagId?: string;
    metricId?: string;
}

export interface CallStats {
    callCount: number;
    averageScore: number | null;
    problematicShare: number;
}

export abstract class CallRepositoryPort {
    abstract upsertMany(calls: Call[]): Promise<void>;

    abstract findByFilter(filter: CallFilter): Promise<Call[]>;

    abstract aggregateStats(filter: CallFilter): Promise<CallStats>;
}
