import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { UserDirectoryPort } from '../domain/ports/user-directory.port';
import { isUuid } from './is-uuid';

const loginRow = z.object({ login: z.string() });

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
}
