import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

export const POLLER_LOCK_KEY = 'telegram:poller:lock';

const EXTEND_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0`;

const SCRIPT_SUCCESS = 1;

export class PollerLock {
    private readonly owner = randomUUID();

    constructor(
        private readonly redis: Redis,
        readonly key: string = POLLER_LOCK_KEY,
    ) {}

    async acquire(ttlMs: number): Promise<boolean> {
        const reply = await this.redis.set(this.key, this.owner, 'PX', ttlMs, 'NX');
        return reply === 'OK';
    }

    async extend(ttlMs: number): Promise<boolean> {
        const reply: unknown = await this.redis.eval(EXTEND_SCRIPT, 1, this.key, this.owner, ttlMs);
        return reply === SCRIPT_SUCCESS;
    }

    async release(): Promise<void> {
        await this.redis.eval(RELEASE_SCRIPT, 1, this.key, this.owner);
    }
}
