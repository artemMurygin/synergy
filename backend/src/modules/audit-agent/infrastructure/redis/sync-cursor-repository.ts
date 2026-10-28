import { Inject, Injectable } from '@nestjs/common';
import { SyncCursorRepositoryPort } from '../../domain/ports/sync-cursor-repository.port';
import { REDIS_CLIENT } from './redis.constants';

export interface CursorRedisClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
}

export const SYNC_CURSOR_KEY = 'audit-agent:deal-sync:cursor';

@Injectable()
export class SyncCursorRepository extends SyncCursorRepositoryPort {
    constructor(@Inject(REDIS_CLIENT) private readonly client: CursorRedisClient) {
        super();
    }

    async get(): Promise<Date | null> {
        const stored = await this.client.get(SYNC_CURSOR_KEY);
        if (stored === null) {
            return null;
        }
        const cursor = new Date(stored);
        return Number.isNaN(cursor.getTime()) ? null : cursor;
    }

    async set(value: Date): Promise<void> {
        await this.client.set(SYNC_CURSOR_KEY, value.toISOString());
    }
}
