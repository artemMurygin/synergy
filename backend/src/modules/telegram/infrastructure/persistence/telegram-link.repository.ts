import { Injectable } from '@nestjs/common';
import { sql, UniqueIntegrityConstraintViolationError, type FragmentSqlToken } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { TelegramAccountTakenError } from '../../domain/errors';
import {
    TelegramLinkRepositoryPort,
    type NotificationsSwitch,
} from '../../domain/ports/telegram-link-repository.port';
import { TelegramIdentity } from '../../domain/telegram-identity';
import { TelegramLink } from '../../domain/telegram-link';
import { bigintColumn, millisColumn } from './sql-columns';

const TELEGRAM_USER_ID_CONSTRAINT = 'telegram_links_telegram_user_id_key';

const linkRow = z.object({
    user_id: z.string(),
    telegram_user_id: bigintColumn,
    chat_id: bigintColumn,
    username: z.string().nullable(),
    notifications_enabled: z.boolean(),
    linked_at: z.number(),
    updated_at: z.number(),
});

const COLUMNS: FragmentSqlToken = sql.fragment`
    user_id,
    telegram_user_id::text AS telegram_user_id,
    chat_id::text AS chat_id,
    username,
    notifications_enabled,
    ${millisColumn('linked_at')},
    ${millisColumn('updated_at')}`;

function toLink(raw: unknown): TelegramLink {
    const row = linkRow.parse(raw);
    return TelegramLink.restore({
        userId: row.user_id,
        identity: TelegramIdentity.of({
            telegramUserId: row.telegram_user_id,
            chatId: row.chat_id,
            username: row.username,
        }),
        notificationsEnabled: row.notifications_enabled,
        linkedAt: new Date(row.linked_at),
        updatedAt: new Date(row.updated_at),
    });
}

function isTelegramUserIdTaken(error: unknown): error is UniqueIntegrityConstraintViolationError {
    return (
        error instanceof UniqueIntegrityConstraintViolationError &&
        error.constraint === TELEGRAM_USER_ID_CONSTRAINT
    );
}

@Injectable()
export class TelegramLinkRepository extends TelegramLinkRepositoryPort {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async findByUserId(userId: string): Promise<TelegramLink | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM telegram_links WHERE user_id = ${userId}`);
        return row === null ? null : toLink(row);
    }

    async findByTelegramUserId(telegramUserId: bigint): Promise<TelegramLink | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM telegram_links
            WHERE telegram_user_id = ${telegramUserId.toString()}::bigint`);
        return row === null ? null : toLink(row);
    }

    async save(link: TelegramLink): Promise<void> {
        try {
            await this.transactions.executor().query(sql.unsafe`
                INSERT INTO telegram_links
                    (user_id, telegram_user_id, chat_id, username, notifications_enabled,
                     linked_at, updated_at)
                VALUES (${link.userId}, ${link.telegramUserId.toString()}::bigint,
                        ${link.chatId.toString()}::bigint, ${link.username},
                        ${link.notificationsEnabled}, ${sql.timestamp(link.linkedAt)},
                        ${sql.timestamp(link.updatedAt)})
                ON CONFLICT (user_id) DO UPDATE SET
                    telegram_user_id = EXCLUDED.telegram_user_id,
                    chat_id = EXCLUDED.chat_id,
                    username = EXCLUDED.username,
                    notifications_enabled = EXCLUDED.notifications_enabled,
                    linked_at = EXCLUDED.linked_at,
                    updated_at = EXCLUDED.updated_at`);
        } catch (error: unknown) {
            if (isTelegramUserIdTaken(error)) throw new TelegramAccountTakenError(error);
            throw error;
        }
    }

    async setNotificationsEnabled(change: NotificationsSwitch): Promise<TelegramLink | null> {
        const sameAccount =
            change.telegramUserId === undefined
                ? sql.fragment`TRUE`
                : sql.fragment`telegram_user_id = ${change.telegramUserId.toString()}::bigint`;
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            UPDATE telegram_links
            SET notifications_enabled = ${change.isEnabled},
                updated_at = ${sql.timestamp(change.now)}
            WHERE user_id = ${change.userId} AND ${sameAccount}
            RETURNING ${COLUMNS}`);
        return row === null ? null : toLink(row);
    }

    async deleteByUserId(userId: string): Promise<TelegramLink | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            DELETE FROM telegram_links WHERE user_id = ${userId}
            RETURNING ${COLUMNS}`);
        return row === null ? null : toLink(row);
    }

    async deleteByUserIdAndChatId(userId: string, chatId: bigint): Promise<TelegramLink | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            DELETE FROM telegram_links WHERE user_id = ${userId} AND chat_id = ${chatId.toString()}::bigint
            RETURNING ${COLUMNS}`);
        return row === null ? null : toLink(row);
    }
}
