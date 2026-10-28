import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditMetricsPort } from '../../domain/ports/audit-metrics.port';
import { EmployeeRepositoryPort } from '../../domain/ports/employee-repository.port';
import type { NotificationJob } from '../../domain/value-objects/notification-job.value-object';
import { NotifierPort } from '../../domain/ports/notifier.port';

export type DeliverNotificationResult = 'sent' | 'skipped';

@Injectable()
export class DeliverNotificationUseCase {
    constructor(
        private readonly employees: EmployeeRepositoryPort,
        private readonly notifier: NotifierPort,
        private readonly logger: PinoLogger,
        private readonly metrics: AuditMetricsPort,
    ) {
        this.logger.setContext(DeliverNotificationUseCase.name);
    }

    async execute(job: NotificationJob): Promise<DeliverNotificationResult> {
        let result: DeliverNotificationResult;
        try {
            result = await this.deliver(job);
        } catch (err: unknown) {
            this.metrics.recordNotification('failed');
            throw err;
        }
        this.metrics.recordNotification(result);
        return result;
    }

    private async deliver(job: NotificationJob): Promise<DeliverNotificationResult> {
        const employee = await this.employees.findByUsername(job.username);
        if (employee === null || !employee.canBeNotified() || employee.telegramChatId === null) {
            this.logger.warn(
                { employeeId: employee?.id, isFound: employee !== null },
                'Notification skipped: no active employee with chat',
            );
            return 'skipped';
        }
        await this.notifier.send(employee.telegramChatId, job.message);
        this.logger.info({ employeeId: employee.id }, 'Notification delivered');
        return 'sent';
    }
}
