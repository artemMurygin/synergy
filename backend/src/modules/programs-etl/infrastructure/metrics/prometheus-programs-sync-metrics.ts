import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter, Histogram } from '@prometheus-io/client';
import type { ProgramsSyncMetricsPort } from '../../application/ports/programs-etl.ports';
import {
    PROGRAMS_ETL_CHANGED_SOURCES_METRIC,
    PROGRAMS_ETL_RUNS_METRIC,
    PROGRAMS_ETL_RUN_DURATION_METRIC,
    PROGRAMS_ETL_SCANS_METRIC,
    PROGRAMS_ETL_TOOL_CALLS_METRIC,
    PROGRAMS_ETL_TOOL_DURATION_METRIC,
} from './programs-etl-metrics.constants';

@Injectable()
export class PrometheusProgramsSyncMetrics implements ProgramsSyncMetricsPort {
    constructor(
        @InjectMetric(PROGRAMS_ETL_SCANS_METRIC) private readonly scans: Counter<'outcome'>,
        @InjectMetric(PROGRAMS_ETL_CHANGED_SOURCES_METRIC)
        private readonly changedSources: Counter,
        @InjectMetric(PROGRAMS_ETL_RUNS_METRIC)
        private readonly runs: Counter<'status' | 'trigger'>,
        @InjectMetric(PROGRAMS_ETL_RUN_DURATION_METRIC)
        private readonly runDuration: Histogram<'status' | 'trigger'>,
        @InjectMetric(PROGRAMS_ETL_TOOL_CALLS_METRIC)
        private readonly toolCalls: Counter<'tool' | 'outcome'>,
        @InjectMetric(PROGRAMS_ETL_TOOL_DURATION_METRIC)
        private readonly toolDuration: Histogram<'tool' | 'outcome'>,
    ) {}

    recordScan(input: { outcome: 'success' | 'failure'; changedSources: number }): void {
        this.scans.inc({ outcome: input.outcome });
        if (input.changedSources > 0) this.changedSources.inc(input.changedSources);
    }

    recordRun(input: {
        status: 'succeeded' | 'failed';
        trigger: 'scheduled' | 'retry';
        durationSeconds: number;
    }): void {
        const labels = { status: input.status, trigger: input.trigger };
        this.runs.inc(labels);
        this.runDuration.observe(labels, input.durationSeconds);
    }

    recordToolCall(input: {
        tool: string;
        outcome: 'success' | 'failure';
        durationSeconds?: number;
    }): void {
        const labels = { tool: input.tool, outcome: input.outcome };
        this.toolCalls.inc(labels);
        if (input.durationSeconds !== undefined) {
            this.toolDuration.observe(labels, input.durationSeconds);
        }
    }
}
