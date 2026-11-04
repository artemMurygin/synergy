import type { ProgramsSyncRunDetails } from '../models/sync-commands';
import type {
    CursorPage,
    ListProgramsSyncRunsQueryInput,
    ProgramsSyncRunSummary,
} from '../models/sync-commands';
import type { SyncRunStorePort } from '../ports/programs-etl.ports';

export class ListProgramsSyncRunsQuery {
    constructor(private readonly runs: SyncRunStorePort) {}

    execute(input: ListProgramsSyncRunsQueryInput): Promise<CursorPage<ProgramsSyncRunSummary>> {
        return this.runs.list(input);
    }
}

export class GetProgramsSyncRunQuery {
    constructor(private readonly runs: SyncRunStorePort) {}

    execute(input: { runId: string }): Promise<ProgramsSyncRunDetails | null> {
        return this.runs.findById(input.runId);
    }
}
