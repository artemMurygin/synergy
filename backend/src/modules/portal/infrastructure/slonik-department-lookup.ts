import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DepartmentLookupPort } from '../domain/ports/department-lookup.port';

const idRow = z.object({ id: z.string() });

@Injectable()
export class SlonikDepartmentLookup extends DepartmentLookupPort {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async findExistingIds(ids: readonly string[]): Promise<string[]> {
        if (ids.length === 0) return [];
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT id FROM auth_departments WHERE id = ANY(${sql.array([...ids], 'text')})`);
        return rows.map((row) => idRow.parse(row).id);
    }
}
