import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTransactionRunner } from '../../../database/postgres/testing/in-memory-transaction-runner';
import { TelegramIdentity } from '../domain/telegram-identity';
import { TelegramLink } from '../domain/telegram-link';
import { BotReplies } from './bot-replies';
import {
    InMemoryTelegramLinkRepository,
    NOW,
    RecordingBotMessenger,
    silentLogger,
} from './test-doubles';
import { UnlinkAccountUseCase } from './unlink-account.use-case';

const IVANOV_ID = '6f1c1d4e-2b1a-4c55-9a3e-0d1f2a3b4c5d';
const PETROV_ID = '0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';

function linkOf(userId: string, telegramUserId: bigint): TelegramLink {
    return TelegramLink.link(
        userId,
        TelegramIdentity.of({ telegramUserId, chatId: telegramUserId, username: null }),
        NOW,
    );
}

describe('UnlinkAccountUseCase', () => {
    let links: InMemoryTelegramLinkRepository;
    let messenger: RecordingBotMessenger;
    let transactions: InMemoryTransactionRunner;
    let useCase: UnlinkAccountUseCase;

    beforeEach(() => {
        links = new InMemoryTelegramLinkRepository();
        messenger = new RecordingBotMessenger();
        transactions = new InMemoryTransactionRunner();
        useCase = new UnlinkAccountUseCase(transactions, links, messenger, silentLogger());
    });

    it('removes the link of the user and tells the previous chat', async () => {
        await links.save(linkOf(IVANOV_ID, 1001n));
        await links.save(linkOf(PETROV_ID, 2002n));

        await useCase.execute(IVANOV_ID);

        expect(await links.findByUserId(IVANOV_ID)).toBeNull();
        expect(await links.findByUserId(PETROV_ID)).not.toBeNull();
        expect(messenger.sent).toEqual([{ chatId: 1001n, html: BotReplies.unlinked() }]);
    });

    it('is idempotent and sends nothing without a link', async () => {
        await links.save(linkOf(IVANOV_ID, 1001n));

        await useCase.execute(IVANOV_ID);
        await useCase.execute(IVANOV_ID);

        expect(messenger.sent).toHaveLength(1);
        expect(links.linksByUserId.size).toBe(0);
    });

    it('deletes in a transaction and messages only after commit', async () => {
        await links.save(linkOf(IVANOV_ID, 1001n));
        const deleteLink = links.deleteByUserId.bind(links);
        let isDeletedInTransaction = false;
        links.deleteByUserId = (userId) => {
            isDeletedInTransaction = transactions.isInTransaction();
            return deleteLink(userId);
        };
        const states: { isInTransaction: boolean; commits: number }[] = [];
        messenger.onSend = () => {
            states.push({
                isInTransaction: transactions.isInTransaction(),
                commits: transactions.commits,
            });
        };

        await useCase.execute(IVANOV_ID);

        expect(isDeletedInTransaction).toBe(true);
        expect(states).toEqual([{ isInTransaction: false, commits: 1 }]);
    });

    it('keeps the unlink when the message cannot be sent', async () => {
        await links.save(linkOf(IVANOV_ID, 1001n));
        messenger.failure = new Error('Telegram is down');

        await expect(useCase.execute(IVANOV_ID)).resolves.toBeUndefined();
        expect(await links.findByUserId(IVANOV_ID)).toBeNull();
    });
});
