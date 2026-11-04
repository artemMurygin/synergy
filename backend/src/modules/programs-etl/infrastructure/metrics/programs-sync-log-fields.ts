import type { AgentToolCallLog } from '../../application/tools/agent-tools.factory';
import type { ProgramsSyncLogEntry } from '../../application/ports/programs-etl.ports';

function compact(
    fields: Record<string, string | number | undefined>,
): Record<string, string | number> {
    return Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
    ) as Record<string, string | number>;
}

/** Explicit allow-list: only metadata fields reach the log, never cells, prompts or record bodies. */
export function toToolLogFields(entry: AgentToolCallLog): Record<string, string | number> {
    return compact({
        group_id: entry.groupId,
        run_id: entry.runId,
        phase: 'tool',
        tool: entry.toolName,
        source: entry.sourceId,
        record: entry.recordId,
        duration: entry.durationMs,
        outcome: entry.outcome,
        error_code: entry.errorCode,
    });
}

export function toPhaseLogFields(entry: ProgramsSyncLogEntry): Record<string, string | number> {
    return compact({
        group_id: entry.groupId,
        run_id: entry.runId,
        phase: entry.phase,
        duration: entry.durationMs,
        outcome: entry.outcome,
        error_code: entry.errorCode,
        changed_sources: entry.changedSources,
    });
}
