import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { AuditMetricsPort } from '../../domain/ports/audit-metrics.port';
import { Employee } from '../../domain/aggregates/employee.aggregate';
import { NotificationJob } from '../../domain/value-objects/notification-job.value-object';
import { TransientNotifyError } from '../../domain/errors/notify.errors';
import { DeliverNotificationUseCase } from './deliver-notification.use-case';

function createEmployee(
    overrides: { isActive?: boolean; telegramChatId?: string | null } = {},
): Employee {
    return Employee.create({
        id: 'employee-1',
        crmResponsibleId: '42',
        fullName: 'Ivan Petrov',
        telegramUsername: 'ivan',
        telegramChatId: 'telegramChatId' in overrides ? (overrides.telegramChatId ?? null) : '555',
        isActive: overrides.isActive ?? true,
    });
}

function setup(employee: Employee | null): {
    useCase: DeliverNotificationUseCase;
    employees: { findByUsername: Mock; findByResponsibleId: Mock };
    notifier: { send: Mock };
    logger: { setContext: Mock; info: Mock; warn: Mock; error: Mock };
    metrics: { recordNotification: Mock };
} {
    const employees = {
        findByUsername: vi.fn().mockResolvedValue(employee),
        findByResponsibleId: vi.fn(),
    };
    const notifier = { send: vi.fn().mockResolvedValue(undefined) };
    const metrics = { recordNotification: vi.fn() };
    const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const useCase = new DeliverNotificationUseCase(
        employees,
        notifier,
        logger as unknown as PinoLogger,
        metrics as unknown as AuditMetricsPort,
    );
    return { useCase, employees, notifier, logger, metrics };
}

const job = new NotificationJob({ username: 'ivan', message: 'Fix the deal' });

describe('DeliverNotificationUseCase', () => {
    it('sends the message to the chat of an active employee', async () => {
        const { useCase, employees, notifier, metrics } = setup(createEmployee());

        await expect(useCase.execute(job)).resolves.toBe('sent');

        expect(metrics.recordNotification).toHaveBeenCalledWith('sent');
        expect(employees.findByUsername).toHaveBeenCalledWith('ivan');
        expect(notifier.send).toHaveBeenCalledWith('555', 'Fix the deal');
    });

    it('skips with a warning when the employee is not found', async () => {
        const { useCase, notifier, logger, metrics } = setup(null);

        await expect(useCase.execute(job)).resolves.toBe('skipped');

        expect(metrics.recordNotification).toHaveBeenCalledWith('skipped');
        expect(notifier.send).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('skips with a warning when the employee is inactive', async () => {
        const { useCase, notifier, logger } = setup(createEmployee({ isActive: false }));

        await expect(useCase.execute(job)).resolves.toBe('skipped');

        expect(notifier.send).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('skips with a warning when the employee has no chat id', async () => {
        const { useCase, notifier, logger } = setup(createEmployee({ telegramChatId: null }));

        await expect(useCase.execute(job)).resolves.toBe('skipped');

        expect(notifier.send).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('propagates a transient notifier error', async () => {
        const { useCase, notifier, metrics } = setup(createEmployee());
        notifier.send.mockRejectedValue(new TransientNotifyError('down'));

        await expect(useCase.execute(job)).rejects.toBeInstanceOf(TransientNotifyError);
        expect(metrics.recordNotification).toHaveBeenCalledWith('failed');
    });
});
