import { makeCounterProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';

export const PROGRAMS_ETL_SCANS_METRIC = 'programs_etl_scans_total';
export const PROGRAMS_ETL_CHANGED_SOURCES_METRIC = 'programs_etl_changed_sources_total';
export const PROGRAMS_ETL_RUNS_METRIC = 'programs_etl_runs_total';
export const PROGRAMS_ETL_RUN_DURATION_METRIC = 'programs_etl_run_duration_seconds';
export const PROGRAMS_ETL_TOOL_CALLS_METRIC = 'programs_etl_tool_calls_total';
export const PROGRAMS_ETL_TOOL_DURATION_METRIC = 'programs_etl_tool_call_duration_seconds';

const RUN_BUCKETS_SECONDS = [1, 5, 15, 30, 60, 120, 300, 600, 1200];
const TOOL_BUCKETS_SECONDS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];

/** Labels are low-cardinality on purpose: never group_id or run_id. */
export const programsEtlMetricProviders = [
    makeCounterProvider({
        name: PROGRAMS_ETL_SCANS_METRIC,
        help: 'Programs ETL source scans by outcome',
        labelNames: ['outcome'],
    }),
    makeCounterProvider({
        name: PROGRAMS_ETL_CHANGED_SOURCES_METRIC,
        help: 'Changed programs ETL sources found by scans',
    }),
    makeCounterProvider({
        name: PROGRAMS_ETL_RUNS_METRIC,
        help: 'Programs ETL group sync runs by status and trigger',
        labelNames: ['status', 'trigger'],
    }),
    makeHistogramProvider({
        name: PROGRAMS_ETL_RUN_DURATION_METRIC,
        help: 'Programs ETL group sync run duration in seconds',
        labelNames: ['status', 'trigger'],
        buckets: RUN_BUCKETS_SECONDS,
    }),
    makeCounterProvider({
        name: PROGRAMS_ETL_TOOL_CALLS_METRIC,
        help: 'Programs ETL agent tool calls by tool and outcome',
        labelNames: ['tool', 'outcome'],
    }),
    makeHistogramProvider({
        name: PROGRAMS_ETL_TOOL_DURATION_METRIC,
        help: 'Programs ETL agent tool call duration in seconds',
        labelNames: ['tool', 'outcome'],
        buckets: TOOL_BUCKETS_SECONDS,
    }),
];
