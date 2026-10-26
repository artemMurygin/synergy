import type { Job, Queue } from 'bullmq';
import type { Histogram } from '@prometheus-io/client';
import { describe, expect, it, vi } from 'vitest';
import { RequestContext } from '../../../../shared/context/request-context';
import type { ProcessAuditUseCase } from '../../application/audit/process-audit.use-case';
import type { AuditAgentResult } from '../../domain/audit/audit-agent';
import { AuditProcessor } from '../../interface/queue/audit.processor';
import type { AuditJobData } from './audit-job-data';
import { BullmqAuditQueue } from './bullmq-audit-queue';

const REQUEST_IDS = { requestId: 'req-1', correlationId: 'corr-1' };

function createJobDuration(): {
    histogram: Histogram<'status'>;
    stopTimer: ReturnType<typeof vi.fn>;
} {
    const stopTimer = vi.fn();
    const histogram = { startTimer: vi.fn(() => stopTimer) } as unknown as Histogram<'status'>;
    return { histogram, stopTimer };
}

describe('audit queue request context', () => {
    it('puts request ids into the job payload', async () => {
        const add = vi.fn().mockResolvedValue(undefined);
        const queue = new BullmqAuditQueue({ add } as unknown as Queue);

        await RequestContext.run(REQUEST_IDS, () => queue.enqueue('run-1'));

        expect(add).toHaveBeenCalledWith(
            'run',
            { runId: 'run-1', requestIds: REQUEST_IDS },
            { jobId: 'run-1' },
        );
    });

    it('enqueues without request ids outside of a request', async () => {
        const add = vi.fn().mockResolvedValue(undefined);
        const queue = new BullmqAuditQueue({ add } as unknown as Queue);

        await queue.enqueue('run-2');

        expect(add).toHaveBeenCalledWith(
            'run',
            { runId: 'run-2', requestIds: undefined },
            { jobId: 'run-2' },
        );
    });

    it('restores request context while processing the job', async () => {
        let observedCorrelationId = '';
        const execute = vi.fn(async (): Promise<AuditAgentResult> => {
            await Promise.resolve();
            observedCorrelationId = RequestContext.getCorrelationId();
            return {} as AuditAgentResult;
        });
        const processor = new AuditProcessor(
            { execute } as unknown as ProcessAuditUseCase,
            createJobDuration().histogram,
        );
        const job = { data: { runId: 'run-3', requestIds: REQUEST_IDS } } as Job<AuditJobData>;

        await processor.process(job);

        expect(execute).toHaveBeenCalledWith('run-3');
        expect(observedCorrelationId).toBe('corr-1');
    });

    it('processes a job without request ids', async () => {
        const execute = vi.fn().mockResolvedValue({});
        const processor = new AuditProcessor(
            { execute } as unknown as ProcessAuditUseCase,
            createJobDuration().histogram,
        );
        const job = { data: { runId: 'run-4' } } as Job<AuditJobData>;

        await processor.process(job);

        expect(RequestContext.getIds()).toBeUndefined();
        expect(execute).toHaveBeenCalledWith('run-4');
    });

    it('records job duration with completed status', async () => {
        const { histogram, stopTimer } = createJobDuration();
        const execute = vi.fn().mockResolvedValue({});
        const processor = new AuditProcessor(
            { execute } as unknown as ProcessAuditUseCase,
            histogram,
        );

        await processor.process({ data: { runId: 'run-5' } } as Job<AuditJobData>);

        expect(stopTimer).toHaveBeenCalledWith({ status: 'completed' });
    });

    it('records job duration with failed status and rethrows', async () => {
        const { histogram, stopTimer } = createJobDuration();
        const failure = new Error('boom');
        const execute = vi.fn().mockRejectedValue(failure);
        const processor = new AuditProcessor(
            { execute } as unknown as ProcessAuditUseCase,
            histogram,
        );

        await expect(
            processor.process({ data: { runId: 'run-6' } } as Job<AuditJobData>),
        ).rejects.toBe(failure);
        expect(stopTimer).toHaveBeenCalledWith({ status: 'failed' });
    });
});
