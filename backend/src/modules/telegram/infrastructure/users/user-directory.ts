import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { UserDirectoryPort, type DirectoryUser } from '../../application/ports/user-directory.port';

const uuidSchema = z.guid();
const userRow = z.object({ id: z.string(), login: z.string() });

@Injectable()
export class UserDirectory extends UserDirectoryPort {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async findActiveById(userId: string): Promise<DirectoryUser | null> {
        if (!uuidSchema.safeParse(userId).success) return null;
        const row = await this.transactions
            .executor()
            .maybeOne(
                sql.type(
                    userRow,
                )`SELECT id, login FROM auth_users WHERE id = ${userId} AND is_active`,
            );
        return row === null ? null : { id: row.id, login: row.login };
    }
}
