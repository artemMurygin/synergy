import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { UserDirectoryPort } from '../domain/ports/user-directory.port';
import { isUuid } from './is-uuid';

const loginRow = z.object({ login: z.string() });

const nameRow = z.object({
    login: z.string(),
    last_name: z.string().nullable(),
    first_name: z.string().nullable(),
    middle_name: z.string().nullable(),
});

@Injectable()
export class UserDirectory extends UserDirectoryPort {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async findLoginById(userId: string): Promise<string | null> {
        if (!isUuid(userId)) return null;
        const row = await this.transactions
            .executor()
            .maybeOne(sql.type(loginRow)`SELECT login FROM auth_users WHERE id = ${userId}`);
        return row?.login ?? null;
    }

    async findFullNameById(userId: string): Promise<string | null> {
        if (!isUuid(userId)) return null;
        const row = await this.transactions.executor().maybeOne(
            sql.type(nameRow)`
                SELECT u.login, p.last_name, p.first_name, p.middle_name
                FROM auth_users u
                LEFT JOIN auth_user_profiles p ON p.user_id = u.id
                WHERE u.id = ${userId}`,
        );
        if (row === null) return null;
        const fullName = [row.last_name, row.first_name, row.middle_name]
            .map((part) => part?.trim() ?? '')
            .filter((part) => part !== '')
            .join(' ');
        return fullName === '' ? row.login : fullName;
    }
}
