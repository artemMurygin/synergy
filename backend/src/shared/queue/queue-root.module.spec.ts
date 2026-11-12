import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getSharedConfigToken } from '@nestjs/bullmq';
import { describe, expect, it } from 'vitest';
import { QueueModule } from '../../modules/audit-agent/infrastructure/queue/queue.module';
import { QueueRootModule } from './queue-root.module';

const values: Record<string, unknown> = {
    REDIS_HOST: 'redis.local',
    REDIS_PORT: '6380',
    REDIS_PASSWORD: 'secret',
    REDIS_DB: '2',
};

@Global()
@Module({
    providers: [{ provide: ConfigService, useValue: { get: (key: string) => values[key] } }],
    exports: [ConfigService],
})
class FakeConfigModule {}

function providesSharedConfig(entry: unknown): boolean {
    if (typeof entry !== 'object' || entry === null || !('providers' in entry)) return false;
    const { providers } = entry;
    return (
        Array.isArray(providers) &&
        providers.some(
            (provider: unknown) =>
                typeof provider === 'object' &&
                provider !== null &&
                'provide' in provider &&
                provider.provide === getSharedConfigToken(),
        )
    );
}

function importsOf(target: object): unknown[] {
    const imports: unknown = Reflect.getMetadata('imports', target);
    return Array.isArray(imports) ? imports : [];
}

describe('QueueRootModule', () => {
    it('is global', () => {
        expect(Reflect.getMetadata('__module:global__', QueueRootModule)).toBe(true);
    });

    it('builds the BullMQ connection from REDIS_* config', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [FakeConfigModule, QueueRootModule],
        }).compile();

        expect(moduleRef.get(getSharedConfigToken())).toEqual({
            connection: { host: 'redis.local', port: 6380, password: 'secret', db: 2 },
        });
        await moduleRef.close();
    });

    it('owns the only forRoot: audit-agent QueueModule registers just its queues', () => {
        const rootImports = importsOf(QueueRootModule);
        const auditImports = importsOf(QueueModule);

        expect(rootImports.some(providesSharedConfig)).toBe(true);
        expect(auditImports.some(providesSharedConfig)).toBe(false);
    });
});
