import { getQueueToken } from '@nestjs/bullmq';
import type { Provider } from '@nestjs/common';
import { Gauge } from '@prometheus-io/client';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from './queue.constants';

export const QUEUE_JOBS_METRIC = 'queue_jobs';

const TRACKED_JOB_STATES = ['waiting', 'active', 'delayed', 'failed', 'completed'] as const;
const QUEUE_LIST = Object.values(QUEUE_NAMES);

export const queueJobsGaugeProvider: Provider = {
    provide: QUEUE_JOBS_METRIC,
    inject: QUEUE_LIST.map((name) => getQueueToken(name)),
    useFactory: (...queues: Queue[]): Gauge<'queue' | 'state'> =>
        new Gauge({
            name: QUEUE_JOBS_METRIC,
            help: 'Number of queue jobs by queue and state',
            labelNames: ['queue', 'state'],
            async collect(): Promise<void> {
                for (const [index, queue] of queues.entries()) {
                    const counts = await queue.getJobCounts(...TRACKED_JOB_STATES);
                    for (const state of TRACKED_JOB_STATES) {
                        this.set({ queue: QUEUE_LIST[index], state }, counts[state] ?? 0);
                    }
                }
            },
        }),
};
