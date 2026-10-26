import { getQueueToken } from '@nestjs/bullmq';
import type { Provider } from '@nestjs/common';
import { Gauge } from '@prometheus-io/client';
import type { Queue } from 'bullmq';
import { AUDIT_QUEUE } from './queue.constants';

export const AUDIT_QUEUE_JOBS_METRIC = 'audit_queue_jobs';

const TRACKED_JOB_STATES = ['waiting', 'active', 'delayed', 'failed', 'completed'] as const;

export const auditQueueJobsGaugeProvider: Provider = {
    provide: AUDIT_QUEUE_JOBS_METRIC,
    inject: [getQueueToken(AUDIT_QUEUE)],
    useFactory: (queue: Queue): Gauge<'state'> =>
        new Gauge({
            name: AUDIT_QUEUE_JOBS_METRIC,
            help: 'Number of audit queue jobs by state',
            labelNames: ['state'],
            async collect(): Promise<void> {
                const counts = await queue.getJobCounts(...TRACKED_JOB_STATES);
                for (const state of TRACKED_JOB_STATES) {
                    this.set({ state }, counts[state] ?? 0);
                }
            },
        }),
};
