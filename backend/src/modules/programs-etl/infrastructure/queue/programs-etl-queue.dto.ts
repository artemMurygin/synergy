export interface SyncGroupJobData {
    runId: string;
    groupId: string;
    changedSources: { sourceId: string; observedHash: string }[];
    previousRunId?: string;
}

export interface ScanSourcesJobData {
    scheduledAt: string;
}
