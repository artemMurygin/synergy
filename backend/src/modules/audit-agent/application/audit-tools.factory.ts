import { Injectable } from '@nestjs/common';
import { MAX_NOTIFICATION_MESSAGE_LENGTH, NOTIFY_RESPONSIBLE_RESULTS } from '../domain/audit-tools';
import type { AuditTools, AuditToolsContext } from '../domain/audit-tools';
import { EmployeeRepositoryPort } from '../domain/ports/employee-repository.port';
import { NotificationJob } from '../domain/value-objects/notification-job.value-object';
import { NotificationQueuePort } from '../domain/ports/notification-queue.port';
import { normalizeTelegramUsername } from '../domain/value-objects/telegram-username';

export const EMPLOYEE_NOT_FOUND_MESSAGE = 'employee not found';

@Injectable()
export class AuditToolsFactory {
    constructor(
        private readonly employeeRepository: EmployeeRepositoryPort,
        private readonly notificationQueue: NotificationQueuePort,
    ) {}

    create(context: AuditToolsContext): AuditTools {
        return {
            getUserTelegramAccountById: {
                invoke: async (id) => {
                    const employee = await this.employeeRepository.findByResponsibleId(id);
                    return employee?.telegramUsername ?? EMPLOYEE_NOT_FOUND_MESSAGE;
                },
            },
            notifyResponsible: {
                invoke: async (username, message) => {
                    const normalized = normalizeTelegramUsername(username);
                    const employee = await this.employeeRepository.findByUsername(normalized);
                    if (employee === null) {
                        return NOTIFY_RESPONSIBLE_RESULTS.EMPLOYEE_NOT_FOUND;
                    }
                    await this.notificationQueue.enqueue(
                        new NotificationJob({
                            username: normalized,
                            message: message.slice(0, MAX_NOTIFICATION_MESSAGE_LENGTH),
                            dedupeKey: `notify-${context.dealId}-${String(context.dealUpdatedAt.getTime())}-${normalized}`,
                        }),
                    );
                    return NOTIFY_RESPONSIBLE_RESULTS.QUEUED;
                },
            },
        };
    }
}
