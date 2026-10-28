import { describe, expect, it, vi, type Mock } from 'vitest';
import { Employee } from '../domain/aggregates/employee.aggregate';
import type { EmployeeRepositoryPort } from '../domain/ports/employee-repository.port';
import type { NotificationQueuePort } from '../domain/ports/notification-queue.port';
import { NotificationJob } from '../domain/value-objects/notification-job.value-object';
import { MAX_NOTIFICATION_MESSAGE_LENGTH } from '../domain/audit-tools';
import { AuditToolsFactory, EMPLOYEE_NOT_FOUND_MESSAGE } from './audit-tools.factory';

function createEmployee(overrides: Partial<{ telegramUsername: string | null }> = {}): Employee {
    return Employee.create({
        id: 'employee-1',
        crmResponsibleId: '42',
        fullName: 'Ivan Petrov',
        telegramUsername: 'ivan_petrov',
        telegramChatId: '1001',
        isActive: true,
        ...overrides,
    });
}

function createFactory(employee: Employee | null): {
    factory: AuditToolsFactory;
    findByResponsibleId: Mock;
    findByUsername: Mock;
    enqueue: Mock;
} {
    const findByResponsibleId = vi.fn().mockResolvedValue(employee);
    const findByUsername = vi.fn().mockResolvedValue(employee);
    const employeeRepository: EmployeeRepositoryPort = {
        findByUsername,
        findByResponsibleId,
    };
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const notificationQueue: NotificationQueuePort = { enqueue };
    const factory = new AuditToolsFactory(employeeRepository, notificationQueue);
    return { factory, findByResponsibleId, findByUsername, enqueue };
}

const context = { dealId: '100', dealUpdatedAt: new Date('2026-01-01T00:00:00Z') };

describe('AuditToolsFactory', () => {
    it('returns the username of an active employee', async () => {
        const { factory, findByResponsibleId } = createFactory(createEmployee());

        const username = await factory.create(context).getUserTelegramAccountById.invoke('42');

        expect(username).toBe('ivan_petrov');
        expect(findByResponsibleId).toHaveBeenCalledWith('42');
    });

    it('returns a not found message when the employee does not exist', async () => {
        const { factory } = createFactory(null);

        await expect(factory.create(context).getUserTelegramAccountById.invoke('42')).resolves.toBe(
            EMPLOYEE_NOT_FOUND_MESSAGE,
        );
    });

    it('returns a not found message when the employee has no username', async () => {
        const { factory } = createFactory(createEmployee({ telegramUsername: null }));

        await expect(factory.create(context).getUserTelegramAccountById.invoke('42')).resolves.toBe(
            EMPLOYEE_NOT_FOUND_MESSAGE,
        );
    });

    it('enqueues a deduplicated notification for an active employee', async () => {
        const { factory, enqueue, findByUsername } = createFactory(createEmployee());

        const result = await factory
            .create(context)
            .notifyResponsible.invoke('@Ivan_Petrov', 'fill the phone');

        expect(result).toBe('queued');
        expect(findByUsername).toHaveBeenCalledWith('ivan_petrov');
        expect(enqueue).toHaveBeenCalledWith(
            new NotificationJob({
                username: 'ivan_petrov',
                message: 'fill the phone',
                dedupeKey: `notify-100-${String(context.dealUpdatedAt.getTime())}-ivan_petrov`,
            }),
        );
    });

    it('does not enqueue when the username belongs to no active employee', async () => {
        const { factory, enqueue } = createFactory(null);

        const result = await factory.create(context).notifyResponsible.invoke('stranger', 'hi');

        expect(result).toBe('employee not found');
        expect(enqueue).not.toHaveBeenCalled();
    });

    it('truncates an overlong message', async () => {
        const { factory, enqueue } = createFactory(createEmployee());

        await factory
            .create(context)
            .notifyResponsible.invoke(
                'ivan_petrov',
                'x'.repeat(MAX_NOTIFICATION_MESSAGE_LENGTH + 50),
            );

        const job = enqueue.mock.calls[0][0] as NotificationJob;
        expect(job.message).toHaveLength(MAX_NOTIFICATION_MESSAGE_LENGTH);
    });
});
