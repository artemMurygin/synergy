import { Counter, Histogram, Registry } from '@prometheus-io/client';
import { describe, expect, it } from 'vitest';
import { PrometheusProgramsSyncMetrics } from './prometheus-programs-sync-metrics';
import {
    PROGRAMS_ETL_CHANGED_SOURCES_METRIC,
    PROGRAMS_ETL_RUNS_METRIC,
    PROGRAMS_ETL_RUN_DURATION_METRIC,
    PROGRAMS_ETL_SCANS_METRIC,
    PROGRAMS_ETL_TOOL_CALLS_METRIC,
    PROGRAMS_ETL_TOOL_DURATION_METRIC,
} from './programs-etl-metrics.constants';

function create(): { metrics: PrometheusProgramsSyncMetrics; registry: Registry } {
    const registry = new Registry();
    const metrics = new PrometheusProgramsSyncMetrics(
        new Counter({
            name: PROGRAMS_ETL_SCANS_METRIC,
            help: 'h',
            labelNames: ['outcome'],
            registers: [registry],
        }),
        new Counter({
            name: PROGRAMS_ETL_CHANGED_SOURCES_METRIC,
            help: 'h',
            registers: [registry],
        }),
        new Counter({
            name: PROGRAMS_ETL_RUNS_METRIC,
            help: 'h',
            labelNames: ['status', 'trigger'],
            registers: [registry],
        }),
        new Histogram({
            name: PROGRAMS_ETL_RUN_DURATION_METRIC,
            help: 'h',
            labelNames: ['status', 'trigger'],
            registers: [registry],
        }),
        new Counter({
            name: PROGRAMS_ETL_TOOL_CALLS_METRIC,
            help: 'h',
            labelNames: ['tool', 'outcome'],
            registers: [registry],
        }),
        new Histogram({
            name: PROGRAMS_ETL_TOOL_DURATION_METRIC,
            help: 'h',
            labelNames: ['tool', 'outcome'],
            registers: [registry],
        }),
    );
    return { metrics, registry };
}

async function valueOf(
    registry: Registry,
    name: string,
    labels: Record<string, string>,
    suffix = '',
): Promise<number | undefined> {
    const all = await registry.getMetricsAsJSON();
    const metric = all.find((m) => m.name === name);
    const found = metric?.values.find(
        (v) =>
            ((v as { metricName?: string }).metricName ?? name) === `${name}${suffix}` &&
            Object.entries(labels).every(([k, val]) => v.labels[k] === val),
    );
    return found?.value;
}

describe('PrometheusProgramsSyncMetrics', () => {
    it('counts scans by outcome and adds changed sources', async () => {
        const { metrics, registry } = create();
        metrics.recordScan({ outcome: 'success', changedSources: 3 });
        metrics.recordScan({ outcome: 'failure', changedSources: 0 });

        expect(await valueOf(registry, PROGRAMS_ETL_SCANS_METRIC, { outcome: 'success' })).toBe(1);
        expect(await valueOf(registry, PROGRAMS_ETL_SCANS_METRIC, { outcome: 'failure' })).toBe(1);
        expect(await valueOf(registry, PROGRAMS_ETL_CHANGED_SOURCES_METRIC, {})).toBe(3);
    });

    it('counts runs and observes duration with status and trigger labels', async () => {
        const { metrics, registry } = create();
        metrics.recordRun({ status: 'succeeded', trigger: 'scheduled', durationSeconds: 2 });
        metrics.recordRun({ status: 'failed', trigger: 'retry', durationSeconds: 1 });

        expect(
            await valueOf(registry, PROGRAMS_ETL_RUNS_METRIC, {
                status: 'failed',
                trigger: 'retry',
            }),
        ).toBe(1);
        expect(
            await valueOf(
                registry,
                PROGRAMS_ETL_RUN_DURATION_METRIC,
                { status: 'succeeded', trigger: 'scheduled' },
                '_sum',
            ),
        ).toBe(2);
    });

    it('counts tool calls and observes tool duration when given', async () => {
        const { metrics, registry } = create();
        metrics.recordToolCall({
            tool: 'read_sheet_range',
            outcome: 'success',
            durationSeconds: 0.5,
        });
        metrics.recordToolCall({ tool: 'read_sheet_range', outcome: 'failure' });

        expect(
            await valueOf(registry, PROGRAMS_ETL_TOOL_CALLS_METRIC, {
                tool: 'read_sheet_range',
                outcome: 'failure',
            }),
        ).toBe(1);
        expect(
            await valueOf(
                registry,
                PROGRAMS_ETL_TOOL_DURATION_METRIC,
                { tool: 'read_sheet_range', outcome: 'success' },
                '_sum',
            ),
        ).toBe(0.5);
    });

    it('never exposes group_id or run_id as labels', async () => {
        const { metrics, registry } = create();
        metrics.recordScan({ outcome: 'success', changedSources: 1 });
        metrics.recordRun({ status: 'succeeded', trigger: 'scheduled', durationSeconds: 1 });
        metrics.recordToolCall({ tool: 't', outcome: 'success', durationSeconds: 1 });

        const text = await registry.metrics();
        expect(text).not.toMatch(/group_id|run_id/);
    });
});
