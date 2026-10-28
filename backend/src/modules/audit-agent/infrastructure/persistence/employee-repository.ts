import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { PG_POOL } from '../../../../database/postgres/database.constants';
import { EmployeeRepositoryPort } from '../../domain/ports/employee-repository.port';
import { normalizeTelegramUsername } from '../../domain/value-objects/telegram-username';
import { Employee } from '../../domain/aggregates/employee.aggregate';
import type { SqlExecutor } from './sql-executor';

const employeeRowSchema = z.object({
    id: z.string(),
    crm_responsible_id: z.string(),
    full_name: z.string(),
    telegram_username: z.string().nullable(),
    telegram_chat_id: z.string().nullable(),
    is_active: z.boolean(),
});

const EMPLOYEE_COLUMNS = sql.fragment`id, crm_responsible_id, full_name, telegram_username, telegram_chat_id::text AS telegram_chat_id, is_active`;

@Injectable()
export class EmployeeRepository extends EmployeeRepositoryPort {
    constructor(@Inject(PG_POOL) private readonly executor: SqlExecutor) {
        super();
    }

    async findByUsername(username: string): Promise<Employee | null> {
        const row = await this.executor.maybeOne(sql.unsafe`
            SELECT ${EMPLOYEE_COLUMNS} FROM employee
            WHERE lower(telegram_username) = ${normalizeTelegramUsername(username)} AND is_active = true
        `);
        return this.toEntity(row);
    }

    async findByResponsibleId(id: string): Promise<Employee | null> {
        const row = await this.executor.maybeOne(sql.unsafe`
            SELECT ${EMPLOYEE_COLUMNS} FROM employee
            WHERE crm_responsible_id = ${id} AND is_active = true
        `);
        return this.toEntity(row);
    }

    private toEntity(rawRow: unknown): Employee | null {
        const row = employeeRowSchema.nullable().parse(rawRow);
        if (row === null) {
            return null;
        }
        return Employee.create({
            id: row.id,
            crmResponsibleId: row.crm_responsible_id,
            fullName: row.full_name,
            telegramUsername: row.telegram_username,
            telegramChatId: row.telegram_chat_id,
            isActive: row.is_active,
        });
    }
}
