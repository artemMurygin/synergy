import { describe, expect, it } from 'vitest';
import { toPhaseLogFields, toToolLogFields } from './programs-sync-log-fields';

describe('programs ETL structured log fields', () => {
    it('maps a tool call to group_id/run_id/phase/tool/source/record/duration/outcome/error_code', () => {
        expect(
            toToolLogFields({
                groupId: 'g1',
                runId: 'r1',
                toolName: 'get_catalog_record',
                durationMs: 12,
                outcome: 'failure',
                errorCode: 'RECORD_NOT_FOUND',
                sourceId: 's1',
                recordId: 'rec1',
            }),
        ).toEqual({
            group_id: 'g1',
            run_id: 'r1',
            phase: 'tool',
            tool: 'get_catalog_record',
            source: 's1',
            record: 'rec1',
            duration: 12,
            outcome: 'failure',
            error_code: 'RECORD_NOT_FOUND',
        });
    });

    it('maps a phase entry and omits undefined fields', () => {
        const fields = toPhaseLogFields({
            phase: 'agent',
            groupId: 'g1',
            runId: 'r1',
            durationMs: 5,
            outcome: 'success',
        });
        expect(fields).toEqual({
            group_id: 'g1',
            run_id: 'r1',
            phase: 'agent',
            duration: 5,
            outcome: 'success',
        });
        expect(Object.keys(fields)).not.toContain('error_code');
    });

    it('never forwards cell values, prompts or record bodies', () => {
        const fields = toToolLogFields({
            groupId: 'g1',
            runId: 'r1',
            toolName: 'read_sheet_range',
            durationMs: 1,
            outcome: 'success',
            range: 'A1:B2',
            rowCount: 2,
            cells: 'SECRET',
            prompt: 'SECRET',
        } as never);
        expect(JSON.stringify(fields)).not.toContain('SECRET');
    });
});
