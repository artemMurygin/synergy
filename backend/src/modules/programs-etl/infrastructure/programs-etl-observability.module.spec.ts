import { Test } from '@nestjs/testing';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { register } from '@prometheus-io/client';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProgramsSyncMetricsPort } from '../application/ports/programs-etl.ports';
import { PROGRAMS_SYNC_METRICS_PORT } from '../programs-etl.tokens';
import { ProgramsEtlObservabilityModule } from './programs-etl-observability.module';

describe('ProgramsEtlObservabilityModule', () => {
    afterEach(() => {
        register.clear();
    });

    it('exposes new programs_etl series on /metrics without group_id/run_id labels', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                PrometheusModule.register({ defaultMetrics: { enabled: false } }),
                ProgramsEtlObservabilityModule,
            ],
        })
            .useMocker((token) =>
                token === PinoLogger
                    ? { setContext: () => undefined, info: () => undefined, warn: () => undefined }
                    : undefined,
            )
            .compile();
        const metrics = moduleRef.get<ProgramsSyncMetricsPort>(PROGRAMS_SYNC_METRICS_PORT);
        metrics.recordScan({ outcome: 'success', changedSources: 2 });
        metrics.recordRun({ status: 'succeeded', trigger: 'scheduled', durationSeconds: 3 });
        metrics.recordToolCall({
            tool: 'read_sheet_range',
            outcome: 'success',
            durationSeconds: 0.2,
        });

        const text = await register.metrics();
        for (const name of [
            'programs_etl_scans_total{outcome="success"} 1',
            'programs_etl_changed_sources_total 2',
            'programs_etl_runs_total{status="succeeded",trigger="scheduled"} 1',
            'programs_etl_run_duration_seconds_count{status="succeeded",trigger="scheduled"} 1',
            'programs_etl_tool_calls_total{tool="read_sheet_range",outcome="success"} 1',
            'programs_etl_tool_call_duration_seconds_count{tool="read_sheet_range",outcome="success"} 1',
        ]) {
            expect(text).toContain(name);
        }
        expect(text).not.toMatch(/group_id|run_id/);
        await moduleRef.close();
    });
});
