import { describe, expect, it, vi } from 'vitest';
import { EmployeeRepository } from './employee-repository';
import type { SqlExecutor } from './sql-executor';

const employeeRow = {
    id: '6f1f2f3e-0000-4000-8000-000000000001',
    crm_responsible_id: 'resp-1',
    full_name: 'Ivan Petrov',
    telegram_username: 'ivan_petrov',
    telegram_chat_id: '12345',
    is_active: true,
};

function createExecutor(row: unknown): {
    executor: SqlExecutor;
    maybeOne: ReturnType<typeof vi.fn>;
} {
    const maybeOne = vi.fn(() => Promise.resolve(row));
    const query = vi.fn(() => Promise.resolve({ rows: [] }));
    return { executor: { maybeOne, query }, maybeOne };
}

function lastQuery(maybeOne: ReturnType<typeof vi.fn>): {
    sql: string;
    values: readonly unknown[];
} {
    const call: unknown = maybeOne.mock.calls[0]?.[0];
    if (typeof call !== 'object' || call === null || !('sql' in call) || !('values' in call)) {
        throw new Error('query was not executed');
    }
    const { sql, values } = call;
    if (typeof sql !== 'string' || !Array.isArray(values)) {
        throw new Error('unexpected query shape');
    }
    return { sql, values };
}

describe('EmployeeRepository', () => {
    it('finds an active employee by responsible id', async () => {
        const { executor, maybeOne } = createExecutor(employeeRow);
        const repository = new EmployeeRepository(executor);

        const employee = await repository.findByResponsibleId('resp-1');

        expect(employee?.id).toBe(employeeRow.id);
        expect(employee?.crmResponsibleId).toBe('resp-1');
        expect(employee?.fullName).toBe('Ivan Petrov');
        expect(employee?.telegramUsername).toBe('ivan_petrov');
        expect(employee?.telegramChatId).toBe('12345');
        expect(employee?.isActive).toBe(true);
        const { sql, values } = lastQuery(maybeOne);
        expect(sql).toContain('crm_responsible_id = $slonik_1');
        expect(sql).toContain('is_active = true');
        expect(values).toEqual(['resp-1']);
    });

    it('finds an active employee by username', async () => {
        const { executor, maybeOne } = createExecutor(employeeRow);
        const repository = new EmployeeRepository(executor);

        const employee = await repository.findByUsername('ivan_petrov');

        expect(employee?.telegramUsername).toBe('ivan_petrov');
        const { sql, values } = lastQuery(maybeOne);
        expect(sql).toContain('lower(telegram_username) = $slonik_1');
        expect(sql).toContain('is_active = true');
        expect(values).toEqual(['ivan_petrov']);
    });

    it('returns null for an unknown responsible id', async () => {
        const { executor } = createExecutor(null);
        const repository = new EmployeeRepository(executor);

        await expect(repository.findByResponsibleId('unknown')).resolves.toBeNull();
    });

    it('returns null for an unknown username', async () => {
        const { executor } = createExecutor(null);
        const repository = new EmployeeRepository(executor);

        await expect(repository.findByUsername('unknown')).resolves.toBeNull();
    });

    it('maps missing chat id to null', async () => {
        const { executor } = createExecutor({ ...employeeRow, telegram_chat_id: null });
        const repository = new EmployeeRepository(executor);

        const employee = await repository.findByUsername('ivan_petrov');

        expect(employee?.telegramChatId).toBeNull();
        expect(employee?.canBeNotified()).toBe(false);
    });
});
