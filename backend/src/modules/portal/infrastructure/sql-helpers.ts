import { sql, type FragmentSqlToken, type ValueExpression } from 'slonik';

/** Колонка TIMESTAMPTZ как миллисекунды (float8), чтобы не терять точность и не зависеть от парсеров. */
export const millis = (expression: string, alias: string): FragmentSqlToken =>
    sql.fragment`(extract(epoch FROM ${sql.identifier(expression.split('.'))}) * 1000)::float8 AS ${sql.identifier([alias])}`;

export const nullableTimestamp = (value: Date | null): ValueExpression =>
    value === null ? null : sql.timestamp(value);

export const toDate = (value: number | null): Date | null =>
    value === null ? null : new Date(value);

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
