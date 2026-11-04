import { ProgramsSyncError } from '../errors/programs-sync.error';
import { isRunnableGroup } from '../models/programs-group';
import type { ScheduleProgramsGroupSyncCommand } from '../models/sync-commands';
import type {
    GroupRegistryPort,
    ProgramsSyncQueuePort,
    SyncRunStorePort,
} from '../ports/programs-etl.ports';

export interface ScheduleServiceClock {
    newId(): string;
    now(): Date;
}

/**
 * Internal application service: creates a queued run and enqueues one `sync-group` job.
 * Shared by the hourly scan and by the explicit retry of a failed run.
 */
export class ScheduleProgramsGroupSyncService {
    constructor(
        private readonly registry: GroupRegistryPort,
        private readonly runs: SyncRunStorePort,
        private readonly queue: ProgramsSyncQueuePort,
        private readonly clock: ScheduleServiceClock,
    ) {}

    async schedule(command: ScheduleProgramsGroupSyncCommand): Promise<{ runId: string }> {
        const group = await this.registry.getGroup(command.groupId);
        if (group === null) {
            throw new ProgramsSyncError('GROUP_NOT_FOUND', `Group not found: ${command.groupId}`);
        }
        if (!isRunnableGroup(group)) {
            throw new ProgramsSyncError(
                'GROUP_NOT_RUNNABLE',
                `Group ${command.groupId} has status ${group.status}`,
            );
        }

        const runId = this.clock.newId();
        const previousRunId = command.previousRunId;
        await this.runs.createQueued({
            id: runId,
            groupId: command.groupId,
            trigger: command.trigger,
            ...(previousRunId === undefined ? {} : { previousRunId }),
            changedSources: command.changedSources,
            now: this.clock.now(),
        });

        try {
            await this.queue.enqueueGroup({
                runId,
                groupId: command.groupId,
                changedSources: command.changedSources,
                ...(previousRunId === undefined ? {} : { previousRunId }),
            });
        } catch (error) {
            await this.runs.markFailed({
                runId,
                failure: {
                    code: 'ENQUEUE_FAILED',
                    message: error instanceof Error ? error.message : String(error),
                    retryable: true,
                },
            });
            throw error;
        }
        return { runId };
    }
}
