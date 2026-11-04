import { ProgramsSyncError } from '../errors/programs-sync.error';
import type { RunFailure } from '../errors/programs-sync.error';
import { isRunnableGroup } from '../models/programs-group';
import type { ProgramsSyncResult, SyncProgramsGroupCommand } from '../models/sync-commands';
import type {
    CatalogWriterPort,
    GroupRegistryPort,
    ProgramsAgentPort,
    ProgramsSyncObservability,
    SourceStateRepositoryPort,
    SyncRunStorePort,
} from '../ports/programs-etl.ports';

function toFailure(error: unknown): RunFailure {
    if (error instanceof ProgramsSyncError) return error.toFailure();
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { code: 'UNEXPECTED_ERROR', message, retryable: false };
}

/**
 * Full group cycle: agent builds a mutation plan, writer applies it, and only then
 * the observed fingerprints are advanced. No transaction spans the whole group.
 */
export class SyncProgramsGroupUseCase {
    constructor(
        private readonly registry: GroupRegistryPort,
        private readonly runStore: SyncRunStorePort,
        private readonly agent: ProgramsAgentPort,
        private readonly writer: CatalogWriterPort,
        private readonly sourceState: SourceStateRepositoryPort,
        private readonly observability: ProgramsSyncObservability = {},
    ) {}

    async execute(command: SyncProgramsGroupCommand): Promise<ProgramsSyncResult> {
        const clock = this.observability.now ?? Date.now;
        const runStarted = clock();
        const trigger = command.trigger ?? 'scheduled';
        const finish = (outcome: 'success' | 'failure', errorCode?: string): void => {
            const durationMs = clock() - runStarted;
            this.observability.metrics?.recordRun({
                status: outcome === 'success' ? 'succeeded' : 'failed',
                trigger,
                durationSeconds: durationMs / 1000,
            });
            this.observability.logger?.log({
                phase: 'run',
                groupId: command.groupId,
                runId: command.runId,
                durationMs,
                outcome,
                ...(errorCode === undefined ? {} : { errorCode }),
            });
        };
        /** Runs one phase and logs its duration/outcome without touching its result. */
        const phase = async <T>(
            name: 'agent' | 'write' | 'fingerprint',
            work: () => Promise<T>,
        ): Promise<T> => {
            const started = clock();
            try {
                const value = await work();
                this.observability.logger?.log({
                    phase: name,
                    groupId: command.groupId,
                    runId: command.runId,
                    durationMs: clock() - started,
                    outcome: 'success',
                });
                return value;
            } catch (error) {
                this.observability.logger?.log({
                    phase: name,
                    groupId: command.groupId,
                    runId: command.runId,
                    durationMs: clock() - started,
                    outcome: 'failure',
                    errorCode: toFailure(error).code,
                });
                throw error;
            }
        };
        try {
            const group = await this.registry.getGroup(command.groupId);
            if (group === null) {
                throw new ProgramsSyncError(
                    'GROUP_NOT_FOUND',
                    `Group not found: ${command.groupId}`,
                );
            }
            if (!isRunnableGroup(group)) {
                throw new ProgramsSyncError(
                    'GROUP_NOT_RUNNABLE',
                    `Group is not runnable: ${command.groupId}`,
                );
            }
            await this.runStore.markRunning(command.runId);
            const plan = await phase('agent', () =>
                this.agent.buildMutationPlan({
                    runId: command.runId,
                    group,
                    changedSources: [...command.changedSources],
                }),
            );
            const { created, updated } = await phase('write', () =>
                this.writer.applyPlan({
                    runId: command.runId,
                    groupId: command.groupId,
                    plan,
                }),
            );
            await phase('fingerprint', () =>
                this.sourceState.markSuccessfullyProcessed({
                    runId: command.runId,
                    fingerprints: [...command.changedSources],
                }),
            );
            await this.runStore.markSucceeded(command.runId);
            finish('success');
            return { runId: command.runId, created, updated };
        } catch (error) {
            const failure = toFailure(error);
            // A transient failure that the queue will retry belongs to the same open run.
            const willRetry = command.finalAttempt === false && failure.retryable;
            if (!willRetry) {
                await this.runStore.markFailed({ runId: command.runId, failure });
                finish('failure', failure.code);
            }
            throw error;
        }
    }
}
