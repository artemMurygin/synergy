import type { JobsOptions, Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { RequestContext } from '../../../../shared/context/request-context';
import { DealId } from '../../domain/value-objects/deal-id.value-object';
import { AuditQueueAdapter } from './audit-queue.adapter';
import type { AuditJobData } from './queue-job-data';
import { JOB_NAMES } from './queue.constants';

const REQUEST_IDS = { requestId: 'req-1', correlationId: 'corr-1' };

describe('AuditQueueAdapter', () => {
    it('enqueues audit-deal with jobId audit-<dealId>', async () => {
        const add = vi
            .fn<(name: string, data: AuditJobData, opts: JobsOptions) => Promise<void>>()
            .mockResolvedValue();
        const queue = new AuditQueueAdapter({ add } as unknown as Queue);

        await queue.enqueue(new DealId('42'));

        expect(add).toHaveBeenCalledTimes(1);
        const [name, data, opts] = add.mock.calls[0];
        expect(name).toBe(JOB_NAMES.AUDIT_DEAL);
        expect(data.dealId).toBe('42');
        expect(opts.jobId).toBe('audit-42');
    });

    it('uses the same jobId for the same deal so BullMQ drops the duplicate', async () => {
        const add = vi
            .fn<(name: string, data: AuditJobData, opts: JobsOptions) => Promise<void>>()
            .mockResolvedValue();
        const queue = new AuditQueueAdapter({ add } as unknown as Queue);

        await queue.enqueue(new DealId('7'));
        await queue.enqueue(new DealId('7'));

        expect(add.mock.calls[0][2].jobId).toBe(add.mock.calls[1][2].jobId);
    });

    it('carries request ids into the payload', async () => {
        const add = vi
            .fn<(name: string, data: AuditJobData, opts: JobsOptions) => Promise<void>>()
            .mockResolvedValue();
        const queue = new AuditQueueAdapter({ add } as unknown as Queue);

        await RequestContext.run(REQUEST_IDS, () => queue.enqueue(new DealId('1')));

        expect(add.mock.calls[0][1]).toEqual({ dealId: '1', requestIds: REQUEST_IDS });
    });

    it('enqueues without request ids outside of a request', async () => {
        const add = vi
            .fn<(name: string, data: AuditJobData, opts: JobsOptions) => Promise<void>>()
            .mockResolvedValue();
        const queue = new AuditQueueAdapter({ add } as unknown as Queue);

        await queue.enqueue(new DealId('2'));

        expect(add.mock.calls[0][1]).toEqual({ dealId: '2', requestIds: undefined });
    });
});
