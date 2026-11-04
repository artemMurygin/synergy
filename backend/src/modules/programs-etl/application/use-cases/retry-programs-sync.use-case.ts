import { ProgramsSyncError } from '../errors/programs-sync.error';
import type { SyncRunStorePort } from '../ports/programs-etl.ports';
import type { ScheduleProgramsGroupSyncService } from '../services/schedule-programs-group-sync.service';

/** Explicit retry of a finished failed run: schedules a new run, never reopens the old one. */
export class RetryProgramsSyncUseCase {
    constructor(
        private readonly runs: SyncRunStorePort,
        private readonly scheduler: ScheduleProgramsGroupSyncService,
    ) {}

    async execute(input: { previousRunId: string }): Promise<{ runId: string }> {
        const previous = await this.runs.findById(input.previousRunId);
        if (previous === null) {
            throw new ProgramsSyncError(
                'RECORD_NOT_FOUND',
                `Sync run not found: ${input.previousRunId}`,
            );
        }
        if (previous.status !== 'failed') {
            throw new ProgramsSyncError(
                'INVALID_QUERY',
                `Only failed runs can be retried, run ${previous.id} is ${previous.status}`,
            );
        }
        return this.scheduler.schedule({
            groupId: previous.groupId,
            changedSources: previous.changedSources,
            trigger: 'retry',
            previousRunId: previous.id,
        });
    }
}
