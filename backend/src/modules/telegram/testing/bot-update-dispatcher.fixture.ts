import { InMemoryTransactionRunner } from '../../../database/postgres/testing/in-memory-transaction-runner';
import { ResetTelegramDialogUseCase } from '../../assistant/application/reset-telegram-dialog.use-case';
import { ActiveRunRegistry } from '../../assistant/infrastructure/active-run-registry';
import { InMemoryChatSessionRepository } from '../../assistant/interface/http/testing/in-memory-chat-session-repository';
import { FakeTranscriber } from '../../transcription/application/test-doubles';
import { TranscribeVoiceUseCase } from '../../transcription/application/transcribe-voice.use-case';
import { TranscriptionResult } from '../../transcription/domain/transcription-result';
import { AssistantDialogReset } from '../application/assistant-dialog-reset';
import { BotUpdateDispatcher } from '../application/bot-update-dispatcher';
import { ChatWorkQueue } from '../application/chat-work-queue';
import { IdentityResolver } from '../application/identity-resolver';
import { LinkAccountUseCase } from '../application/link-account.use-case';
import { SetTelegramNotificationsUseCase } from '../application/set-telegram-notifications.use-case';
import {
    FixedClock,
    InMemoryBotFiles,
    InMemoryLinkTokenStore,
    InMemoryTelegramLinkRepository,
    InMemoryUpdateDeduplicator,
    InMemoryUserDirectory,
    RecordingBotMessenger,
    silentLogger,
} from '../application/test-doubles';
import { FreeTextHandlerPort } from '../application/ports/free-text-handler.port';
import { UnlinkAccountUseCase } from '../application/unlink-account.use-case';
import { VoiceMessageHandler } from '../application/voice-message-handler';
import { testTelegramSettings } from './telegram-settings.fixture';

/** Stands in for the agent: free text is answered with a fixed reply. */
class StubFreeTextHandler extends FreeTextHandlerPort {
    handle(): Promise<string[]> {
        return Promise.resolve(['stub agent reply']);
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
        new AssistantDialogReset(
            new ResetTelegramDialogUseCase(
                new InMemoryChatSessionRepository(),
                {
                    deleteThread: () => Promise.resolve(),
                    latestCheckpointId: () => Promise.resolve(null),
                },
                new ActiveRunRegistry(),
            ),
        ),
        new StubFreeTextHandler(),
        new VoiceMessageHandler(
            new InMemoryBotFiles(),
            new TranscribeVoiceUseCase(
                FakeTranscriber.answering(TranscriptionResult.text('stub transcript')),
                silentLogger(),
            ),
            silentLogger(),
        ),
        new ChatWorkQueue(messenger, silentLogger()),
        messenger,
        settings,
        silentLogger(),
    );
}
