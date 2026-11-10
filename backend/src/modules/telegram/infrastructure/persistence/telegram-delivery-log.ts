import { Injectable } from '@nestjs/common';
import { sql, type CommonQueryMethods } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { BaseError } from '../../../../shared/errors';
import {
    TelegramDeliveryLogPort,
    type DeliveryReservation,
    type DeliveryReservationRequest,
    type SentDelivery,
} from '../../domain/ports/telegram-delivery-log.port';
import { millisColumn } from './sql-columns';

const MAX_RESERVE_ATTEMPTS = 3;

const reservedRow = z.object({ notification_id: z.string() });

const deliveryStateRow = z.object({
    status: z.enum(['sending', 'sent', 'skipped']),
    reserved_at: z.number(),
});

export class DeliveryLogInsideTransactionError extends BaseError {
    readonly code = 'TELEGRAM.DELIVERY_LOG_INSIDE_TRANSACTION';
}

@Injectable()
export class TelegramDeliveryLog extends TelegramDeliveryLogPort {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async reserve(request: DeliveryReservationRequest): Promise<DeliveryReservation> {
        for (let attempt = 1; attempt <= MAX_RESERVE_ATTEMPTS; attempt += 1) {
            if (await this.tryReserve(request)) return 'reserved';
            const state = await this.findState(request.notificationId);
            if (state === null) continue;
            if (state.status !== 'sending') return 'done';
            return { inProgressUntil: new Date(state.reserved_at + request.reservationMs) };
        }
        return { inProgressUntil: request.now };
    }

    async markSent(delivery: SentDelivery): Promise<void> {
        await this.autocommitExecutor().query(sql.unsafe`
            UPDATE telegram_deliveries
            SET status = 'sent',
                message_id = ${delivery.messageId.toString()}::bigint,
                sent_at = ${sql.timestamp(delivery.sentAt)}
            WHERE notification_id = ${delivery.notificationId} AND status = 'sending'`);
    }

    async markSkipped(notificationId: string): Promise<void> {
        await this.autocommitExecutor().query(sql.unsafe`
            UPDATE telegram_deliveries SET status = 'skipped'
            WHERE notification_id = ${notificationId} AND status = 'sending'`);
    }

    async release(notificationId: string): Promise<void> {
        await this.autocommitExecutor().query(sql.unsafe`
            DELETE FROM telegram_deliveries
            WHERE notification_id = ${notificationId} AND status = 'sending'`);
    }

    private async tryReserve(request: DeliveryReservationRequest): Promise<boolean> {
        const staleBefore = new Date(request.now.getTime() - request.reservationMs);
        const row = await this.autocommitExecutor().maybeOne(
            sql.type(reservedRow)`
                INSERT INTO telegram_deliveries (notification_id, user_id, status, reserved_at)
                VALUES (${request.notificationId}, ${request.userId}, 'sending',
                        ${sql.timestamp(request.now)})
                ON CONFLICT (notification_id) DO UPDATE
                SET reserved_at = EXCLUDED.reserved_at, user_id = EXCLUDED.user_id
                WHERE telegram_deliveries.status = 'sending'
                  AND telegram_deliveries.reserved_at < ${sql.timestamp(staleBefore)}
                RETURNING notification_id`,
        );
        return row !== null;
    }

    private async findState(
        notificationId: string,
    ): Promise<z.infer<typeof deliveryStateRow> | null> {
        const row = await this.autocommitExecutor().maybeOne(sql.unsafe`
            SELECT status, ${millisColumn('reserved_at')}
            FROM telegram_deliveries WHERE notification_id = ${notificationId}`);
        return row === null ? null : deliveryStateRow.parse(row);
    }

    private autocommitExecutor(): CommonQueryMethods {
        if (this.transactions.isInTransaction()) {
            throw new DeliveryLogInsideTransactionError(
                'Telegram delivery log must commit each write on its own',
            );
        }
        return this.transactions.executor();
    }
}
