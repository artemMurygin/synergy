import { InMemoryTransactionRunner } from '../../../database/postgres/testing/in-memory-transaction-runner';
import { BotUpdateDispatcher } from '../application/bot-update-dispatcher';
import { IdentityResolver } from '../application/identity-resolver';
import { LinkAccountUseCase } from '../application/link-account.use-case';
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
import { FreeTextHandlerPort } from '../application/ports/free-text-handler.port';
import { UnlinkAccountUseCase } from '../application/unlink-account.use-case';
import { testTelegramSettings } from './telegram-settings.fixture';

/** Stands in for the agent: free text is answered with a fixed reply. */
class StubFreeTextHandler extends FreeTextHandlerPort {
    handle(): Promise<string> {
        return Promise.resolve('stub agent reply');
    }
}

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
        new StubFreeTextHandler(),
        messenger,
        settings,
        silentLogger(),
    );
}
