import type { GroupSource } from '../models/programs-group';
import type { ChangedSource } from '../models/source-fingerprint';
import { ProgramsSyncError } from '../errors/programs-sync.error';
import type { ScanProgramSourcesResult } from '../models/sync-commands';
import type {
    GroupRegistryPort,
    ProgramsSyncObservability,
    SheetsReaderPort,
    SourceStateRepositoryPort,
    SyncRunStorePort,
} from '../ports/programs-etl.ports';
import type { ScheduleProgramsGroupSyncService } from '../services/schedule-programs-group-sync.service';

/**
 * Hourly scan: compares observed sheet hashes with the last successfully processed ones
 * and schedules one sync job per changed group. It never advances the successful fingerprint.
 */
export class ScanProgramSourcesUseCase {
    constructor(
        private readonly registry: GroupRegistryPort,
        private readonly sheets: SheetsReaderPort,
        private readonly sourceState: SourceStateRepositoryPort,
        private readonly runs: SyncRunStorePort,
        private readonly scheduler: ScheduleProgramsGroupSyncService,
        private readonly observability: ProgramsSyncObservability = {},
    ) {}

    async execute(now: Date): Promise<ScanProgramSourcesResult> {
        const clock = this.observability.now ?? Date.now;
        const started = clock();
        try {
            const result = await this.scan(now);
            this.observability.metrics?.recordScan({
                outcome: 'success',
                changedSources: result.changedSources,
            });
            this.observability.logger?.log({
                phase: 'scan',
                durationMs: clock() - started,
                outcome: 'success',
                changedSources: result.changedSources,
            });
            return result;
        } catch (error) {
            this.observability.metrics?.recordScan({ outcome: 'failure', changedSources: 0 });
            this.observability.logger?.log({
                phase: 'scan',
                durationMs: clock() - started,
                outcome: 'failure',
                errorCode: error instanceof ProgramsSyncError ? error.code : 'UNEXPECTED_ERROR',
            });
            throw error;
        }
    }

    private async scan(_now: Date): Promise<ScanProgramSourcesResult> {
        const groups = await this.registry.listScheduledGroups();
        const sources: GroupSource[] = groups.flatMap((group) => [...group.sources]);
        if (sources.length === 0) {
            return { scannedSources: 0, changedSources: 0, enqueuedGroups: 0 };
        }

        const observed = await this.sheets.readFingerprints(sources);
        const saved = await this.sourceState.findSuccessfulFingerprints(
            sources.map((source) => source.sourceId),
        );

        let changedCount = 0;
        let enqueuedGroups = 0;
        let firstError: unknown;
        for (const group of groups) {
            const changed: ChangedSource[] = [];
            for (const source of group.sources) {
                const observedFingerprint = observed.get(source.sourceId);
                if (observedFingerprint === undefined) continue;
                const savedFingerprint = saved.get(source.sourceId) ?? null;
                if (savedFingerprint?.value !== observedFingerprint.value) {
                    changed.push({
                        sourceId: source.sourceId,
                        observedHash: observedFingerprint.value,
                    });
                }
            }
            if (changed.length === 0) continue;
            // One group's failure must not block the remaining groups.
            try {
                if (await this.hasActiveRunFor(group.id, changed)) continue;
                await this.scheduler.schedule({
                    groupId: group.id,
                    changedSources: changed,
                    trigger: 'scheduled',
                });
            } catch (error) {
                firstError ??= error;
                continue;
            }
            changedCount += changed.length;
            enqueuedGroups += 1;
        }
        if (firstError !== undefined)
            throw firstError instanceof Error
                ? firstError
                : new Error('Unexpected failure', { cause: firstError });

        return { scannedSources: sources.length, changedSources: changedCount, enqueuedGroups };
    }

    /** A queued or running run of the group for exactly the same observed hashes. */
    private async hasActiveRunFor(
        groupId: string,
        changed: readonly ChangedSource[],
    ): Promise<boolean> {
        const key = (sources: readonly ChangedSource[]): string =>
            sources
                .map((s) => `${s.sourceId}=${s.observedHash}`)
                .sort()
                .join('|');
        const wanted = key(changed);
        for (const status of ['queued', 'running'] as const) {
            const page = await this.runs.list({ groupId, status, limit: 50 });
            for (const item of page.items) {
                const run = await this.runs.findById(item.id);
                if (run !== null && key(run.changedSources) === wanted) return true;
            }
        }
        return false;
    }
}
