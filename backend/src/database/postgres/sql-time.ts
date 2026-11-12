import { sql, type FragmentSqlToken, type ValueExpression } from 'slonik';

/** Колонка timestamptz как миллисекунды эпохи под тем же именем. */
export const millisColumn = (column: string): FragmentSqlToken =>
    sql.fragment`(extract(epoch FROM ${sql.identifier([column])}) * 1000)::float8 AS ${sql.identifier([column])}`;

export const toTimestampOrNull = (value: Date | null): ValueExpression =>
    value === null ? null : sql.timestamp(value);
