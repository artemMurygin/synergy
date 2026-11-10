import { sql, type FragmentSqlToken } from 'slonik';
import { z } from 'zod';

const DIGITS = /^-?\d+$/;

export const bigintColumn = z
    .string()
    .regex(DIGITS)
    .transform((digits) => BigInt(digits));

export function millisColumn(column: string): FragmentSqlToken {
    return sql.fragment`(extract(epoch FROM ${sql.identifier([column])}) * 1000)::float8 AS ${sql.identifier([column])}`;
}
