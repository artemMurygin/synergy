import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createPool, sql, type DatabasePool } from 'slonik';
import { z } from 'zod';
import { migrate } from '../../../database/postgres/migrator';
import { DomainEvent, type DomainEventProps } from '../../ddd';
import { DomainEventRegistry, type EventSubscriber } from '../application/domain-event-registry';

export const THING_HAPPENED = 'testing.thing_happened';

export class ThingHappenedEvent extends DomainEvent {
    readonly label: string;

    constructor(props: DomainEventProps<ThingHappenedEvent>) {
        super(props);
        this.label = props.label;
    }
}

export function thingHappened(aggregateId: string, label = 'label'): ThingHappenedEvent {
    return new ThingHappenedEvent({
        aggregateId,
        label,
        metadata: { timestamp: 1_700_000_000_000, correlationId: 'corr-1', userId: 'user-1' },
    });
}

export function registerThingHappened(registry: DomainEventRegistry): void {
    registry.registerEvent({
        eventType: THING_HAPPENED,
        eventClass: ThingHappenedEvent,
        schema: z.object({ label: z.string().min(1) }),
        toPayload: (event) => ({ label: event.label }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new ThingHappenedEvent({ id, aggregateId, metadata, ...payload }),
    });
}

export function createRegistry(subscribers: readonly EventSubscriber[]): DomainEventRegistry {
    const registry = new DomainEventRegistry();
    registerThingHappened(registry);
    for (const subscriber of subscribers) registry.subscribe(THING_HAPPENED, subscriber);
    return registry;
}

export function silentSubscriber(name: string): EventSubscriber {
    return { name, handle: () => Promise.resolve() };
}

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

export interface OutboxTestDatabase {
    readonly url: string;
    createPool(): Promise<DatabasePool>;
    drop(): Promise<void>;
}

export async function createOutboxTestDatabase(
    adminUrl: string,
    prefix: string,
): Promise<OutboxTestDatabase> {
    const dbName = `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    await admin.end();
    const url = withDatabase(adminUrl, dbName);
    await migrate(url);
    return {
        url,
        createPool: () => createPool(url),
        drop: async () => {
            const dropper = new Client({ connectionString: adminUrl });
            await dropper.connect();
            await dropper.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
            await dropper.end();
        },
    };
}

const deliveryRow = z.object({
    event_id: z.string(),
    subscriber: z.string(),
    status: z.string(),
    attempts: z.number(),
    next_attempt_at: z.number(),
    last_error: z.string().nullable(),
    processed_at: z.number().nullable(),
});

export type DeliveryRow = z.infer<typeof deliveryRow>;

export async function readDeliveries(pool: DatabasePool): Promise<DeliveryRow[]> {
    const rows = await pool.any(sql.unsafe`
        SELECT event_id, subscriber, status, attempts, last_error,
               (extract(epoch FROM next_attempt_at) * 1000)::float8 AS next_attempt_at,
               (extract(epoch FROM processed_at) * 1000)::float8 AS processed_at
        FROM outbox_deliveries ORDER BY event_id, subscriber`);
    return rows.map((row) => deliveryRow.parse(row));
}

export async function readDelivery(
    pool: DatabasePool,
    eventId: string,
    subscriber: string,
): Promise<DeliveryRow | undefined> {
    const deliveries = await readDeliveries(pool);
    return deliveries.find(
        (delivery) => delivery.event_id === eventId && delivery.subscriber === subscriber,
    );
}

const eventIdRow = z.object({ id: z.string() });

export async function readEventIds(pool: DatabasePool): Promise<string[]> {
    const rows = await pool.any(sql.unsafe`SELECT id FROM outbox_events ORDER BY id`);
    return rows.map((row) => eventIdRow.parse(row).id);
}

export async function truncateOutbox(pool: DatabasePool): Promise<void> {
    await pool.query(sql.unsafe`TRUNCATE outbox_deliveries, outbox_events`);
}

export async function setEventCreatedAt(
    pool: DatabasePool,
    eventId: string,
    createdAt: Date,
): Promise<void> {
    await pool.query(
        sql.unsafe`UPDATE outbox_events SET created_at = ${sql.timestamp(createdAt)} WHERE id = ${eventId}`,
    );
}

export async function setDeliveryStatus(
    pool: DatabasePool,
    eventId: string,
    subscriber: string,
    status: 'pending' | 'done' | 'failed',
): Promise<void> {
    await pool.query(sql.unsafe`
        UPDATE outbox_deliveries SET status = ${status}
        WHERE event_id = ${eventId} AND subscriber = ${subscriber}`);
}

export interface TestDeliveryLease {
    readonly eventId: string;
    readonly subscriber: string;
    readonly claimToken: string;
}

export async function leaseDelivery(
    pool: DatabasePool,
    eventId: string,
    subscriber: string,
): Promise<TestDeliveryLease> {
    const claimToken = randomUUID();
    await pool.query(sql.unsafe`
        UPDATE outbox_deliveries SET claim_token = ${claimToken}
        WHERE event_id = ${eventId} AND subscriber = ${subscriber}`);
    return { eventId, subscriber, claimToken };
}
