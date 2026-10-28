import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { RequestContext } from '../../../../shared/context/request-context';
import { ArgumentInvalidError } from '../../../../shared/errors';
import type { AuditDealUseCase } from '../../application/use-cases/audit-deal.use-case';
import { DealId } from '../../domain/value-objects/deal-id.value-object';
import { AuditProcessor } from './audit.processor';
import type { AuditJobData } from '../../infrastructure/queue/queue-job-data';

function createJob(data: unknown): Job<AuditJobData> {
    return { id: 'job-1', data } as unknown as Job<AuditJobData>;
}

function setup(): {
    processor: AuditProcessor;
    auditDeal: { execute: Mock };
    logger: { setContext: Mock; info: Mock; warn: Mock; error: Mock };
} {
    const auditDeal = {
        execute: vi.fn().mockResolvedValue({ status: 'audited', verdict: 'ok' }),
    };
    const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const processor = new AuditProcessor(
        auditDeal as unknown as AuditDealUseCase,
        logger as unknown as PinoLogger,
    );
    return { processor, auditDeal, logger };
}

describe('AuditProcessor', () => {
    it('audits the deal from the job data', async () => {
        const { processor, auditDeal } = setup();

        const result = await processor.process(createJob({ dealId: '42' }));

        expect(auditDeal.execute).toHaveBeenCalledWith(new DealId('42'));
        expect(result).toEqual({ status: 'audited', verdict: 'ok' });
    });

    it('restores the request context from the job data', async () => {
        const { processor, auditDeal } = setup();
        const requestIds = { requestId: 'req-1', correlationId: 'corr-1' };
        let seen: unknown;
        auditDeal.execute.mockImplementation(() => {
            seen = RequestContext.getIds();
            return Promise.resolve({ status: 'audited', verdict: 'ok' });
        });

        await processor.process(createJob({ dealId: '42', requestIds }));

        expect(seen).toEqual(requestIds);
    });

    it('fails permanently on an invalid payload', async () => {
        const { processor, auditDeal } = setup();

        await expect(processor.process(createJob({ dealId: '' }))).rejects.toBeInstanceOf(
            UnrecoverableError,
        );
        expect(auditDeal.execute).not.toHaveBeenCalled();
    });

    it('rethrows any use case error so the queue retries', async () => {
        const { processor, auditDeal } = setup();
        const error = new ArgumentInvalidError('blank reason');
        auditDeal.execute.mockRejectedValue(error);

        await expect(processor.process(createJob({ dealId: '42' }))).rejects.toBe(error);
    });

    it('logs an error only when all attempts are exhausted', () => {
        const { processor, logger } = setup();
        const err = new Error('llm down');

        processor.onFailed({ id: 'job-1', attemptsMade: 1, opts: { attempts: 3 } }, err);
        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalled();

        processor.onFailed({ id: 'job-1', attemptsMade: 3, opts: { attempts: 3 } }, err);
        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ err, jobId: 'job-1', attemptsMade: 3 }),
            'Audit failed after all attempts',
        );
    });
});
