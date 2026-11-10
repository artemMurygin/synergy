import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTransactionRunner } from '../../../database/postgres/testing/in-memory-transaction-runner';
import { InvalidLinkTokenError, TelegramAccountTakenError } from '../domain/errors';
import { LinkToken } from '../domain/link-token';
import { TelegramIdentity } from '../domain/telegram-identity';
import { TelegramLink } from '../domain/telegram-link';
import { BotReplies } from './bot-replies';
import { LinkAccountUseCase } from './link-account.use-case';
import {
    FixedClock,
    InMemoryLinkTokenStore,
    InMemoryTelegramLinkRepository,
    InMemoryUserDirectory,
    NOW,
    RecordingBotMessenger,
    silentLogger,
} from './test-doubles';

const IVANOV_ID = '6f1c1d4e-2b1a-4c55-9a3e-0d1f2a3b4c5d';
const PETROV_ID = '0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';
const LATER = new Date('2026-03-01T13:00:00.000Z');
const TTL_SECONDS = 600;

function identityOf(telegramUserId: bigint, username: string | null = 'tg_user'): TelegramIdentity {
    return TelegramIdentity.of({ telegramUserId, chatId: telegramUserId, username });
}

class RacingLinkRepository extends InMemoryTelegramLinkRepository {
    override save(link: TelegramLink): Promise<void> {
        const owner = [...this.linksByUserId.values()].find(
            (stored) => stored.telegramUserId === link.telegramUserId,
        );
        if (owner !== undefined && owner.userId !== link.userId) {
            return Promise.reject(new TelegramAccountTakenError());
        }
        return super.save(link);
    }

    override findByTelegramUserId(): Promise<TelegramLink | null> {
        return Promise.resolve(null);
    }
}

describe('LinkAccountUseCase', () => {
    let tokens: InMemoryLinkTokenStore;
    let users: InMemoryUserDirectory;
    let links: InMemoryTelegramLinkRepository;
    let messenger: RecordingBotMessenger;
    let transactions: InMemoryTransactionRunner;
    let clock: FixedClock;

    function useCaseWith(repository: InMemoryTelegramLinkRepository = links): LinkAccountUseCase {
        return new LinkAccountUseCase(
            transactions,
            tokens,
            users,
            repository,
            messenger,
            clock,
            silentLogger(),
        );
    }

    async function issueToken(userId: string): Promise<string> {
        const token = LinkToken.generate(TTL_SECONDS, clock.now());
        await tokens.save(token.digest(), userId, TTL_SECONDS);
        return token.value;
    }

    beforeEach(() => {
        tokens = new InMemoryLinkTokenStore();
        users = new InMemoryUserDirectory();
        links = new InMemoryTelegramLinkRepository();
        messenger = new RecordingBotMessenger();
        transactions = new InMemoryTransactionRunner();
        clock = new FixedClock();
        users.add({ id: IVANOV_ID, login: 'ivanov' });
        users.add({ id: PETROV_ID, login: 'petrov' });
    });

    it('links the account with notifications enabled and confirms with the login', async () => {
        const token = await issueToken(IVANOV_ID);

        const result = await useCaseWith().execute({
            token,
            identity: identityOf(1001n, 'ivanov_tg'),
        });

        expect(result).toEqual({ kind: 'linked', login: 'ivanov', previousChatId: null });
        const link = await links.findByUserId(IVANOV_ID);
        expect(link?.telegramUserId).toBe(1001n);
        expect(link?.chatId).toBe(1001n);
        expect(link?.username).toBe('ivanov_tg');
        expect(link?.notificationsEnabled).toBe(true);
        expect(link?.linkedAt).toEqual(NOW);
        expect(messenger.sent).toEqual([{ chatId: 1001n, html: BotReplies.linked('ivanov') }]);
    });

    it('burns the token so the same link cannot be used again', async () => {
        const token = await issueToken(IVANOV_ID);
        await useCaseWith().execute({ token, identity: identityOf(1001n) });

        await expect(
            useCaseWith().execute({ token, identity: identityOf(2002n) }),
        ).rejects.toBeInstanceOf(InvalidLinkTokenError);
        expect((await links.findByUserId(IVANOV_ID))?.telegramUserId).toBe(1001n);
        expect(await links.findByTelegramUserId(2002n)).toBeNull();
    });

    it.each([
        ['an unknown token', LinkToken.generate(TTL_SECONDS, NOW).value],
        ['a malformed token', 'not-a-token'],
        ['an empty token', ''],
    ])('rejects %s without linking or messaging', async (_case, token) => {
        await expect(
            useCaseWith().execute({ token, identity: identityOf(1001n) }),
        ).rejects.toBeInstanceOf(InvalidLinkTokenError);
        expect(links.linksByUserId.size).toBe(0);
        expect(messenger.sent).toEqual([]);
    });

    it('rejects an expired token that the store no longer returns', async () => {
        const token = await issueToken(IVANOV_ID);
        tokens.tokensByDigest.clear();

        await expect(
            useCaseWith().execute({ token, identity: identityOf(1001n) }),
        ).rejects.toBeInstanceOf(InvalidLinkTokenError);
        expect(links.linksByUserId.size).toBe(0);
    });

    it('rejects a token of a disabled user and burns it', async () => {
        const token = await issueToken(IVANOV_ID);
        users.activeUsersById.delete(IVANOV_ID);

        await expect(
            useCaseWith().execute({ token, identity: identityOf(1001n) }),
        ).rejects.toBeInstanceOf(InvalidLinkTokenError);
        expect(tokens.tokensByDigest.size).toBe(0);
        expect(links.linksByUserId.size).toBe(0);
        expect(messenger.sent).toEqual([]);
    });

    it('rejects a Telegram account linked to another user, keeps that link and burns the token', async () => {
        const petrovLink = TelegramLink.link(PETROV_ID, identityOf(1001n, 'shared_tg'), NOW);
        await links.save(petrovLink);
        const token = await issueToken(IVANOV_ID);

        await expect(
            useCaseWith().execute({ token, identity: identityOf(1001n, 'shared_tg') }),
        ).rejects.toBeInstanceOf(TelegramAccountTakenError);
        expect(tokens.tokensByDigest.size).toBe(0);
        expect(await links.findByUserId(PETROV_ID)).toBe(petrovLink);
        expect(await links.findByUserId(IVANOV_ID)).toBeNull();
        expect(messenger.sent).toEqual([]);
    });

    it('relinks the same Telegram account keeping the notification setting', async () => {
        const existing = TelegramLink.link(IVANOV_ID, identityOf(1001n, 'old_name'), NOW);
        existing.disableNotifications(NOW);
        await links.save(existing);
        clock.current = LATER;
        const token = await issueToken(IVANOV_ID);

        const result = await useCaseWith().execute({
            token,
            identity: TelegramIdentity.of({
                telegramUserId: 1001n,
                chatId: 1001n,
                username: 'new_name',
            }),
        });

        expect(result.previousChatId).toBeNull();
        const link = await links.findByUserId(IVANOV_ID);
        expect(links.linksByUserId.size).toBe(1);
        expect(link?.username).toBe('new_name');
        expect(link?.notificationsEnabled).toBe(false);
        expect(link?.linkedAt).toEqual(NOW);
        expect(link?.updatedAt).toEqual(LATER);
        expect(messenger.textsTo(1001n)).toEqual([BotReplies.linked('ivanov')]);
    });

    it('replaces the previous Telegram account and notifies its chat about the unlink', async () => {
        await links.save(TelegramLink.link(IVANOV_ID, identityOf(1001n), NOW));
        clock.current = LATER;
        const token = await issueToken(IVANOV_ID);

        const result = await useCaseWith().execute({ token, identity: identityOf(2002n) });

        expect(result).toEqual({ kind: 'linked', login: 'ivanov', previousChatId: 1001n });
        const link = await links.findByUserId(IVANOV_ID);
        expect(links.linksByUserId.size).toBe(1);
        expect(link?.telegramUserId).toBe(2002n);
        expect(link?.notificationsEnabled).toBe(true);
        expect(link?.linkedAt).toEqual(LATER);
        expect(await links.findByTelegramUserId(1001n)).toBeNull();
        expect(messenger.textsTo(2002n)).toEqual([BotReplies.linked('ivanov')]);
        expect(messenger.textsTo(1001n)).toEqual([BotReplies.unlinked()]);
    });

    it('turns a lost race for the same Telegram account into TelegramAccountTakenError', async () => {
        const racing = new RacingLinkRepository();
        await racing.save(TelegramLink.link(PETROV_ID, identityOf(1001n), NOW));
        const token = await issueToken(IVANOV_ID);

        await expect(
            useCaseWith(racing).execute({ token, identity: identityOf(1001n) }),
        ).rejects.toBeInstanceOf(TelegramAccountTakenError);
        expect(await racing.findByUserId(IVANOV_ID)).toBeNull();
        expect(messenger.sent).toEqual([]);
    });

    it('runs the link in one transaction and sends the messages only after commit', async () => {
        await links.save(TelegramLink.link(IVANOV_ID, identityOf(1001n), NOW));
        const token = await issueToken(IVANOV_ID);
        const consumeToken = tokens.consume.bind(tokens);
        const saveLink = links.save.bind(links);
        const states: { isInTransaction: boolean; commits: number }[] = [];
        let isConsumedInTransaction = false;
        let isSavedInTransaction = false;
        tokens.consume = (digest) => {
            isConsumedInTransaction = transactions.isInTransaction();
            return consumeToken(digest);
        };
        links.save = (link) => {
            isSavedInTransaction = transactions.isInTransaction();
            return saveLink(link);
        };
        messenger.onSend = () => {
            states.push({
                isInTransaction: transactions.isInTransaction(),
                commits: transactions.commits,
            });
        };

        await useCaseWith().execute({ token, identity: identityOf(2002n) });

        expect(isConsumedInTransaction).toBe(true);
        expect(isSavedInTransaction).toBe(true);
        expect(transactions.commits).toBe(1);
        expect(states).toEqual([
            { isInTransaction: false, commits: 1 },
            { isInTransaction: false, commits: 1 },
        ]);
    });

    it('does not roll back the link when the confirmation cannot be sent', async () => {
        await links.save(TelegramLink.link(IVANOV_ID, identityOf(1001n), NOW));
        const token = await issueToken(IVANOV_ID);
        messenger.failure = new Error('Telegram is down');

        const result = await useCaseWith().execute({ token, identity: identityOf(2002n) });

        expect(result).toEqual({ kind: 'linked', login: 'ivanov', previousChatId: 1001n });
        expect((await links.findByUserId(IVANOV_ID))?.telegramUserId).toBe(2002n);
    });

    it('still notifies the previous chat when the confirmation fails', async () => {
        await links.save(TelegramLink.link(IVANOV_ID, identityOf(1001n), NOW));
        const token = await issueToken(IVANOV_ID);
        const attempted: bigint[] = [];
        messenger.onSend = ({ chatId }) => {
            attempted.push(chatId);
            messenger.failure = chatId === 2002n ? new Error('Telegram is down') : null;
        };

        await useCaseWith().execute({ token, identity: identityOf(2002n) });

        expect(attempted.sort()).toEqual([1001n, 2002n]);
        expect(messenger.textsTo(1001n)).toEqual([BotReplies.unlinked()]);
    });
});
