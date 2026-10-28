import type { QuerySqlToken } from 'slonik';

export interface SqlExecutor {
    maybeOne(query: QuerySqlToken): Promise<unknown>;
    query(query: QuerySqlToken): Promise<unknown>;
}
