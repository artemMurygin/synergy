import type { Entity } from './entity.base';

export interface Mapper<TEntity extends Entity<object>, TRecord, TResponse = unknown> {
    toPersistence(entity: TEntity): TRecord;
    toDomain(record: TRecord): TEntity;
    toResponse(entity: TEntity): TResponse;
}
