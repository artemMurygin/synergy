import { InMemoryTransactionRunner } from '../../../database/postgres/testing/in-memory-transaction-runner';
import { BotUpdateDispatcher } from '../application/bot-update-dispatcher';
import { IdentityResolver } from '../application/identity-resolver';
import { LinkAccountUseCase } from '../application/link-account.use-case';
import { NotSupportedFreeTextHandler } from '../application/not-supported-free-text-handler';
import { SetTelegramNotificationsUseCase } from '../application/set-telegram-notifications.use-case';
import {
    FixedClock,
    InMemoryLinkTokenStore,
    InMemoryTelegramLinkRepository,
    InMemoryUpdateDeduplicator,
    InMemoryUserDirectory,
    RecordingBotMessenger,
    silentLogger,
} from '../application/test-doubles';
import { UnlinkAccountUseCase } from '../application/unlink-account.use-case';
import { testTelegramSettings } from './telegram-settings.fixture';

export function testBotUpdateDispatcher(): BotUpdateDispatcher {
    const transactions = new InMemoryTransactionRunner();
    const links = new InMemoryTelegramLinkRepository();
    const users = new InMemoryUserDirectory();
    const messenger = new RecordingBotMessenger();
    const clock = new FixedClock();
    const settings = testTelegramSettings();
    return new BotUpdateDispatcher(
        new InMemoryUpdateDeduplicator(),
        new IdentityResolver(links, users),
        new LinkAccountUseCase(
            transactions,
            new InMemoryLinkTokenStore(),
            users,
            links,
            messenger,
            clock,
            silentLogger(),
        ),
        new UnlinkAccountUseCase(transactions, links, messenger, silentLogger()),
        new SetTelegramNotificationsUseCase(settings, links, clock),
        new NotSupportedFreeTextHandler(),
        messenger,
        settings,
        silentLogger(),
    );
}
