import { inspect } from 'node:util';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTransactionRunner } from '../../../database/postgres/testing/in-memory-transaction-runner';
import { ResetTelegramDialogUseCase } from '../../assistant/application/reset-telegram-dialog.use-case';
import { ActiveRunRegistry } from '../../assistant/infrastructure/active-run-registry';
import { InMemoryChatSessionRepository } from '../../assistant/interface/http/testing/in-memory-chat-session-repository';
import { FakeTranscriber } from '../../transcription/application/test-doubles';
import {
    MAX_VOICE_DURATION_SEC,
    TranscribeVoiceUseCase,
} from '../../transcription/application/transcribe-voice.use-case';
import { TranscriptionResult } from '../../transcription/domain/transcription-result';
import type { LinkedBotSender } from '../domain/bot-sender';
import { LinkToken } from '../domain/link-token';
import { TelegramIdentity } from '../domain/telegram-identity';
import { TelegramLink } from '../domain/telegram-link';
import { TEST_BOT_USERNAME, testTelegramSettings } from '../testing/telegram-settings.fixture';
import { AssistantDialogReset } from './assistant-dialog-reset';
import { BotReplies } from './bot-replies';
import { BotUpdateDispatcher, parseIncomingMessage } from './bot-update-dispatcher';
import { ChatWorkQueue } from './chat-work-queue';
import { IdentityResolver } from './identity-resolver';
import { LinkAccountUseCase } from './link-account.use-case';
import { FreeTextHandlerPort } from './ports/free-text-handler.port';
import { SetTelegramNotificationsUseCase } from './set-telegram-notifications.use-case';
import {
    FixedClock,
    InMemoryBotFiles,
    InMemoryLinkTokenStore,
    InMemoryTelegramLinkRepository,
    InMemoryUpdateDeduplicator,
    InMemoryUserDirectory,
    NOW,
    RecordingBotMessenger,
    silentLogger,
} from './test-doubles';
import { UnlinkAccountUseCase } from './unlink-account.use-case';
import { VoiceMessageHandler } from './voice-message-handler';

const IVANOV_ID = '6f1c1d4e-2b1a-4c55-9a3e-0d1f2a3b4c5d';
const PETROV_ID = '0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';
const IVANOV_TG = 1001;
const STRANGER_TG = 3003;
const TTL_SECONDS = 600;

interface MessageUpdateInput {
    readonly updateId: number;
    readonly text?: string;
    readonly content?: Record<string, unknown>;
    readonly fromId?: number;
    readonly chatType?: string;
    readonly hasSender?: boolean;
}

function messageUpdate(input: MessageUpdateInput): Record<string, unknown> {
    const fromId = input.fromId ?? IVANOV_TG;
    return {
        update_id: input.updateId,
        message: {
            message_id: 10,
            date: 1_767_000_000,
            chat: {
                id: input.chatType === 'group' ? -100500 : fromId,
                type: input.chatType ?? 'private',
            },
            ...(input.hasSender === false
                ? {}
                : {
                      from: {
                          id: fromId,
                          is_bot: false,
                          first_name: 'Ivan',
                          username: 'ivanov_tg',
                      },
                  }),
            ...(input.text === undefined ? {} : { text: input.text }),
            ...input.content,
        },
    };
}

class RecordingFreeTextHandler extends FreeTextHandlerPort {
    readonly calls: { sender: LinkedBotSender; text: string }[] = [];
    readonly signals: (AbortSignal | undefined)[] = [];
    failure: Error | null = null;
    private gate: Promise<void> = Promise.resolve();
    private openGate: () => void = () => undefined;

    constructor(private readonly parts: string[] = ['free text reply']) {
        super();
    }

    /** Keeps the next answers pending until `release` is called, like a slow agent. */
    hold(): void {
        this.gate = new Promise((resolve) => {
            this.openGate = resolve;
        });
    }

    release(): void {
        this.openGate();
    }

    async handle(sender: LinkedBotSender, text: string, cancel?: AbortSignal): Promise<string[]> {
        this.calls.push({ sender, text });
        this.signals.push(cancel);
        await this.gate;
        if (this.failure !== null) throw this.failure;
        return this.parts;
    }
}

const VOICE_FILE_ID = 'voice-file-1';
const VOICE_FILE_PATH = 'voice/file_1.oga';
const VOICE_AUDIO = Buffer.from('OggS-fake-opus-payload');
const VOICE_TRANSCRIPT = 'Поставь Ивану задачу позвонить клиенту завтра';

function voiceContent(durationSec = 12): Record<string, unknown> {
    return {
        voice: {
            file_id: VOICE_FILE_ID,
            file_unique_id: 'u1',
            duration: durationSec,
            mime_type: 'audio/ogg',
            file_size: VOICE_AUDIO.byteLength,
        },
    };
}

/** Lets the background chat work run to its end. */
async function settle(): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

function privateMessage(content: Record<string, unknown>): Record<string, unknown> {
    return {
        update_id: 500,
        message: {
            message_id: 10,
            date: 1_767_000_000,
            chat: { id: IVANOV_TG, type: 'private' },
            from: { id: IVANOV_TG, is_bot: false, first_name: 'Ivan', username: 'ivanov_tg' },
            ...content,
        },
    };
}

describe('parseIncomingMessage', () => {
    it('parses a private text message with its sender', () => {
        const message = parseIncomingMessage(500, privateMessage({ text: 'Привет' }));

        expect(message?.updateId).toBe(500);
        expect(message?.content).toEqual({ kind: 'text', text: 'Привет' });
        expect(message?.sender).toEqual(
            TelegramIdentity.of({
                telegramUserId: BigInt(IVANOV_TG),
                chatId: BigInt(IVANOV_TG),
                username: 'ivanov_tg',
            }),
        );
    });

    it('parses a voice message with the file id, the duration, the type and the size', () => {
        const message = parseIncomingMessage(
            500,
            privateMessage({
                voice: {
                    file_id: 'AwACAgIAAxkBAAIB',
                    file_unique_id: 'AgADxyz',
                    duration: 17,
                    mime_type: 'audio/ogg',
                    file_size: 52_340,
                },
            }),
        );

        expect(message?.content).toEqual({
            kind: 'voice',
            fileId: 'AwACAgIAAxkBAAIB',
            durationSec: 17,
            mimeType: 'audio/ogg',
            fileSize: 52_340,
        });
    });

    it('parses a voice message without the type and the size', () => {
        const message = parseIncomingMessage(
            500,
            privateMessage({ voice: { file_id: 'f1', file_unique_id: 'u1', duration: 3 } }),
        );

        expect(message?.content).toEqual({
            kind: 'voice',
            fileId: 'f1',
            durationSec: 3,
            mimeType: null,
            fileSize: null,
        });
    });

    it.each([
        ['a photo', { photo: [{ file_id: 'p', file_unique_id: 'u', width: 1, height: 1 }] }],
        ['a photo with a caption', { photo: [{ file_id: 'p' }], caption: 'Смотри' }],
        ['a document', { document: { file_id: 'd', file_unique_id: 'u' } }],
        ['a sticker', { sticker: { file_id: 's', file_unique_id: 'u', type: 'regular' } }],
        ['a video', { video: { file_id: 'v', file_unique_id: 'u', duration: 5 } }],
        ['a video note', { video_note: { file_id: 'n', file_unique_id: 'u', duration: 5 } }],
        ['an audio file', { audio: { file_id: 'a', file_unique_id: 'u', duration: 5 } }],
        ['a location', { location: { latitude: 55.75, longitude: 37.62 } }],
        ['a malformed voice', { voice: { duration: 3 } }],
    ])('marks %s as unsupported content', (_case, content) => {
        expect(parseIncomingMessage(500, privateMessage(content))?.content).toEqual({
            kind: 'unsupported',
        });
    });

    it.each([
        [
            'a voice message in a group chat',
            {
                update_id: 500,
                message: {
                    chat: { id: -100500, type: 'group' },
                    from: { id: IVANOV_TG },
                    voice: { file_id: 'f', duration: 1 },
                },
            },
        ],
        [
            'a message without a sender',
            { update_id: 500, message: { chat: { id: IVANOV_TG, type: 'private' }, text: 'x' } },
        ],
        ['an update without a message', { update_id: 500, edited_message: { text: 'x' } }],
    ])('ignores %s', (_case, update) => {
        expect(parseIncomingMessage(500, update)).toBeNull();
    });
});

describe('BotUpdateDispatcher', () => {
    let deduplicator: InMemoryUpdateDeduplicator;
    let links: InMemoryTelegramLinkRepository;
    let users: InMemoryUserDirectory;
    let tokens: InMemoryLinkTokenStore;
    let messenger: RecordingBotMessenger;
    let freeText: FreeTextHandlerPort;
    let logger: PinoLogger;
    let clock: FixedClock;
    let nextUpdateId: number;
    let queue: ChatWorkQueue;
    let files: InMemoryBotFiles;
    let transcriber: FakeTranscriber;
    let sessions: InMemoryChatSessionRepository;
    let deletedThreads: string[];
    let resetDialog: ResetTelegramDialogUseCase;

    function dispatcher(): BotUpdateDispatcher {
        const transactions = new InMemoryTransactionRunner();
        return new BotUpdateDispatcher(
            deduplicator,
            new IdentityResolver(links, users),
            new LinkAccountUseCase(
                transactions,
                tokens,
                users,
                links,
                messenger,
                clock,
                silentLogger(),
            ),
            new UnlinkAccountUseCase(transactions, links, messenger, silentLogger()),
            new SetTelegramNotificationsUseCase(testTelegramSettings(), links, clock),
            new AssistantDialogReset(resetDialog),
            freeText,
            new VoiceMessageHandler(
                files,
                new TranscribeVoiceUseCase(transcriber, silentLogger()),
                silentLogger(),
            ),
            queue,
            messenger,
            testTelegramSettings(),
            logger,
        );
    }

    function send(text: string, fromId: number = IVANOV_TG): Promise<unknown> {
        nextUpdateId += 1;
        return dispatcher().dispatch(messageUpdate({ updateId: nextUpdateId, text, fromId }));
    }

    function sendContent(
        content: Record<string, unknown>,
        fromId: number = IVANOV_TG,
    ): Promise<unknown> {
        nextUpdateId += 1;
        return dispatcher().dispatch(messageUpdate({ updateId: nextUpdateId, content, fromId }));
    }

    async function linkIvanov(): Promise<TelegramLink> {
        const link = TelegramLink.link(
            IVANOV_ID,
            TelegramIdentity.of({
                telegramUserId: BigInt(IVANOV_TG),
                chatId: BigInt(IVANOV_TG),
                username: 'ivanov_tg',
            }),
            NOW,
        );
        await links.save(link);
        return link;
    }

    async function issueToken(userId: string): Promise<string> {
        const token = LinkToken.generate(TTL_SECONDS, NOW);
        await tokens.save(token.digest(), userId, TTL_SECONDS);
        return token.value;
    }

    function repliesToIvanov(): string[] {
        return messenger.textsTo(BigInt(IVANOV_TG));
    }

    beforeEach(() => {
        deduplicator = new InMemoryUpdateDeduplicator();
        links = new InMemoryTelegramLinkRepository();
        users = new InMemoryUserDirectory();
        tokens = new InMemoryLinkTokenStore();
        messenger = new RecordingBotMessenger();
        freeText = new RecordingFreeTextHandler();
        logger = silentLogger();
        clock = new FixedClock();
        nextUpdateId = 100;
        queue = new ChatWorkQueue(messenger, silentLogger());
        files = new InMemoryBotFiles();
        files.add(VOICE_FILE_ID, {
            filePath: VOICE_FILE_PATH,
            fileSize: VOICE_AUDIO.byteLength,
            content: VOICE_AUDIO,
        });
        transcriber = FakeTranscriber.answering(TranscriptionResult.text(VOICE_TRANSCRIPT));
        sessions = new InMemoryChatSessionRepository();
        deletedThreads = [];
        resetDialog = new ResetTelegramDialogUseCase(
            sessions,
            {
                deleteThread: (id: string) => {
                    deletedThreads.push(id);
                    return Promise.resolve();
                },
                latestCheckpointId: () => Promise.resolve(null),
            },
            new ActiveRunRegistry(),
        );
        users.add({ id: IVANOV_ID, login: 'ivanov' });
        users.add({ id: PETROV_ID, login: 'petrov' });
    });

    describe('deduplication and parsing', () => {
        it('skips an update with an already processed update_id', async () => {
            await linkIvanov();
            const update = messageUpdate({ updateId: 7, text: '/help' });

            await expect(dispatcher().dispatch(update)).resolves.toBe('handled');
            await expect(dispatcher().dispatch(update)).resolves.toBe('duplicate');

            expect(repliesToIvanov()).toEqual([BotReplies.help('ivanov')]);
        });

        it.each([
            ['a group chat', messageUpdate({ updateId: 1, text: '/start', chatType: 'group' })],
            [
                'a message without a sender',
                messageUpdate({ updateId: 2, text: '/start', hasSender: false }),
            ],
            ['an update without a message', { update_id: 4, edited_message: { text: '/start' } }],
        ])('ignores %s without answering', async (_case, update) => {
            await expect(dispatcher().dispatch(update)).resolves.toBe('ignored');
            expect(messenger.sent).toEqual([]);
        });

        it.each([
            ['null', null],
            ['a string', 'update'],
            ['an update without update_id', { message: { text: '/start' } }],
            ['a negative update_id', { update_id: -1 }],
        ])('ignores %s without throwing', async (_case, update) => {
            await expect(dispatcher().dispatch(update)).resolves.toBe('ignored');
            expect(messenger.sent).toEqual([]);
            expect(deduplicator.processedUpdateIds.size).toBe(0);
        });
    });

    describe('anonymous sender', () => {
        it('links the account by /start with a token', async () => {
            const token = await issueToken(IVANOV_ID);

            await expect(send(`/start ${token}`)).resolves.toBe('handled');

            expect((await links.findByUserId(IVANOV_ID))?.telegramUserId).toBe(BigInt(IVANOV_TG));
            expect(repliesToIvanov()).toEqual([BotReplies.linked('ivanov')]);
        });

        it('links by /start addressed to the bot by name', async () => {
            const token = await issueToken(IVANOV_ID);

            await send(`/start@${TEST_BOT_USERNAME} ${token}`);

            expect(await links.findByUserId(IVANOV_ID)).not.toBeNull();
        });

        it('answers an invalid token without linking', async () => {
            await send(`/start ${LinkToken.generate(TTL_SECONDS, NOW).value}`);

            expect(links.linksByUserId.size).toBe(0);
            expect(repliesToIvanov()).toEqual([BotReplies.invalidLinkToken()]);
        });

        it('answers that the Telegram account belongs to another user', async () => {
            await links.save(
                TelegramLink.link(
                    PETROV_ID,
                    TelegramIdentity.of({
                        telegramUserId: BigInt(STRANGER_TG),
                        chatId: BigInt(STRANGER_TG),
                        username: null,
                    }),
                    NOW,
                ),
            );
            users.activeUsersById.delete(PETROV_ID);
            const token = await issueToken(IVANOV_ID);

            await send(`/start ${token}`, STRANGER_TG);

            expect(await links.findByUserId(IVANOV_ID)).toBeNull();
            expect(messenger.textsTo(BigInt(STRANGER_TG))).toEqual([BotReplies.accountTaken()]);
        });

        it.each(['/start', '/help', '/unlink', '/mute', '/unmute', '/new', 'Привет', '/unknown'])(
            'answers "%s" with the linking instruction',
            async (text) => {
                await expect(send(text)).resolves.toBe('handled');

                expect(repliesToIvanov()).toEqual([BotReplies.notLinked()]);
            },
        );

        it('treats a disabled linked user as unlinked and keeps the link', async () => {
            await linkIvanov();
            users.activeUsersById.delete(IVANOV_ID);

            await send('/mute');

            expect(repliesToIvanov()).toEqual([BotReplies.notLinked()]);
            expect((await links.findByUserId(IVANOV_ID))?.notificationsEnabled).toBe(true);
        });
    });

    describe('linked sender', () => {
        it.each(['/start', '/help', `/help@${TEST_BOT_USERNAME}`])(
            'answers "%s" with the help',
            async (text) => {
                await linkIvanov();

                await send(text);

                expect(repliesToIvanov()).toEqual([BotReplies.help('ivanov')]);
            },
        );

        it('unlinks by /unlink and answers once', async () => {
            await linkIvanov();

            await send('/unlink');

            expect(await links.findByUserId(IVANOV_ID)).toBeNull();
            expect(repliesToIvanov()).toEqual([BotReplies.unlinked()]);
        });

        it('mutes and unmutes the notifications', async () => {
            await linkIvanov();

            await send('/mute');
            expect((await links.findByUserId(IVANOV_ID))?.notificationsEnabled).toBe(false);

            await send('/unmute');
            expect((await links.findByUserId(IVANOV_ID))?.notificationsEnabled).toBe(true);

            expect(repliesToIvanov()).toEqual([
                BotReplies.notificationsDisabled(),
                BotReplies.notificationsEnabled(),
            ]);
        });

        it('relinks the same account by /start with a new token', async () => {
            const link = await linkIvanov();
            link.disableNotifications(NOW);
            const token = await issueToken(IVANOV_ID);

            await send(`/start ${token}`);

            expect(links.linksByUserId.size).toBe(1);
            expect((await links.findByUserId(IVANOV_ID))?.notificationsEnabled).toBe(false);
            expect(repliesToIvanov()).toEqual([BotReplies.linked('ivanov')]);
        });

        it('rejects /start with a token of another user for a linked Telegram account', async () => {
            await linkIvanov();
            const token = await issueToken(PETROV_ID);

            await send(`/start ${token}`);

            expect(await links.findByUserId(PETROV_ID)).toBeNull();
            expect((await links.findByUserId(IVANOV_ID))?.telegramUserId).toBe(BigInt(IVANOV_TG));
            expect(repliesToIvanov()).toEqual([BotReplies.accountTaken()]);
        });

        it.each(['Подготовь КП для клиента', '/unknown'])(
            'passes "%s" to the free text handler and answers with its reply',
            async (text) => {
                const link = await linkIvanov();
                const recording = new RecordingFreeTextHandler();
                freeText = recording;

                await send(text);
                await settle();

                expect(recording.calls).toEqual([
                    { sender: { kind: 'linked', userId: IVANOV_ID, login: 'ivanov', link }, text },
                ]);
                expect(repliesToIvanov()).toEqual(['free text reply']);
            },
        );

        it('sends every part of the free text reply in order', async () => {
            await linkIvanov();
            freeText = new RecordingFreeTextHandler(['часть 1', 'часть 2', 'часть 3']);

            await send('Длинный вопрос');
            await settle();

            expect(repliesToIvanov()).toEqual(['часть 1', 'часть 2', 'часть 3']);
        });

        it('lists /new in the help', async () => {
            await linkIvanov();

            await send('/help');

            expect(repliesToIvanov()[0]).toContain('/new — начать новый диалог');
        });

        it('answers an unsupported message without calling the agent', async () => {
            await linkIvanov();
            const recording = new RecordingFreeTextHandler();
            freeText = recording;

            await expect(
                sendContent({
                    photo: [{ file_id: 'p', file_unique_id: 'u', width: 1, height: 1 }],
                }),
            ).resolves.toBe('handled');
            await settle();

            expect(repliesToIvanov()).toEqual([BotReplies.unsupportedMessage()]);
            expect(recording.calls).toEqual([]);
        });
    });

    describe('background agent work', () => {
        it('accepts the text before the agent answers and shows typing', async () => {
            await linkIvanov();
            const recording = new RecordingFreeTextHandler(['ответ агента']);
            recording.hold();
            freeText = recording;

            await expect(send('Подготовь КП')).resolves.toBe('handled');

            expect(repliesToIvanov()).toEqual([]);
            expect(messenger.chatActions).toContainEqual({
                chatId: BigInt(IVANOV_TG),
                action: 'typing',
            });

            recording.release();
            await settle();
            expect(repliesToIvanov()).toEqual(['ответ агента']);
        });

        it('answers a second message while the first is processed without calling the agent', async () => {
            await linkIvanov();
            const recording = new RecordingFreeTextHandler(['ответ на первое']);
            recording.hold();
            freeText = recording;

            await send('первое');
            await expect(send('второе')).resolves.toBe('handled');

            expect(repliesToIvanov()).toEqual([BotReplies.stillProcessing()]);
            recording.release();
            await settle();
            expect(recording.calls.map(({ text }) => text)).toEqual(['первое']);
            expect(repliesToIvanov()).toEqual([BotReplies.stillProcessing(), 'ответ на первое']);
        });

        it('handles /mute at once while the agent is answering', async () => {
            await linkIvanov();
            const recording = new RecordingFreeTextHandler(['ответ агента']);
            recording.hold();
            freeText = recording;

            await send('вопрос');
            await send('/mute');

            expect((await links.findByUserId(IVANOV_ID))?.notificationsEnabled).toBe(false);
            expect(repliesToIvanov()).toEqual([BotReplies.notificationsDisabled()]);
            recording.release();
            await settle();
        });

        it('answers a failed work with the failure message and frees the chat', async () => {
            await linkIvanov();
            const recording = new RecordingFreeTextHandler(['ответ']);
            recording.failure = new Error('agent is down');
            freeText = recording;
            const errorLog = vi.spyOn(logger, 'error');

            await expect(send('секретный текст пользователя')).resolves.toBe('handled');
            await settle();

            expect(repliesToIvanov()).toEqual([BotReplies.agentFailed()]);
            expect(inspect(errorLog.mock.calls, { depth: 5 })).not.toContain('секретный текст');

            recording.failure = null;
            await send('ещё раз');
            await settle();
            expect(repliesToIvanov()).toEqual([BotReplies.agentFailed(), 'ответ']);
        });
    });

    describe('voice messages', () => {
        it('sends only the agent answer for a transcribed voice, without echoing the transcript', async () => {
            const link = await linkIvanov();
            const recording = new RecordingFreeTextHandler(['Карточка задачи']);
            freeText = recording;

            await expect(sendContent(voiceContent())).resolves.toBe('handled');
            await settle();

            expect(repliesToIvanov()).toEqual(['Карточка задачи']);
            expect(recording.calls).toEqual([
                {
                    sender: { kind: 'linked', userId: IVANOV_ID, login: 'ivanov', link },
                    text: VOICE_TRANSCRIPT,
                },
            ]);
        });

        it('explains a failed transcription and does not call the agent', async () => {
            await linkIvanov();
            const recording = new RecordingFreeTextHandler();
            freeText = recording;
            transcriber = FakeTranscriber.answering(TranscriptionResult.noSpeech());

            await sendContent(voiceContent());
            await settle();

            expect(repliesToIvanov()).toEqual([BotReplies.voiceNoSpeech()]);
            expect(recording.calls).toEqual([]);
        });

        it('rejects a voice longer than 3 minutes without downloading it', async () => {
            await linkIvanov();
            const recording = new RecordingFreeTextHandler();
            freeText = recording;

            await sendContent(voiceContent(MAX_VOICE_DURATION_SEC + 1));
            await settle();

            expect(repliesToIvanov()).toEqual([BotReplies.voiceTooLong()]);
            expect(files.getFileCalls).toEqual([]);
            expect(recording.calls).toEqual([]);
        });

        it('answers a voice from an unlinked chat with the linking instruction without downloading it', async () => {
            await expect(sendContent(voiceContent())).resolves.toBe('handled');
            await settle();

            expect(repliesToIvanov()).toEqual([BotReplies.notLinked()]);
            expect(files.getFileCalls).toEqual([]);
            expect(files.downloadCalls).toEqual([]);
            expect(transcriber.calls).toEqual([]);
        });

        it('answers an unsupported message from an unlinked chat with the linking instruction', async () => {
            await sendContent({ sticker: { file_id: 's', file_unique_id: 'u', type: 'regular' } });

            expect(repliesToIvanov()).toEqual([BotReplies.notLinked()]);
        });
    });

    describe('/new', () => {
        it('removes the Telegram dialog and confirms a new one', async () => {
            await linkIvanov();
            const dialog = await sessions.findOrCreateTelegram(IVANOV_ID);

            await expect(send('/new')).resolves.toBe('handled');

            expect(await sessions.findTelegram(IVANOV_ID)).toBeNull();
            expect(deletedThreads).toEqual([dialog.id]);
            expect(repliesToIvanov()).toEqual([BotReplies.dialogReset()]);
        });

        it('confirms a new dialog when there is none yet', async () => {
            await linkIvanov();

            await send('/new');

            expect(deletedThreads).toEqual([]);
            expect(repliesToIvanov()).toEqual([BotReplies.dialogReset()]);
        });

        it('does not send the result of the work interrupted by /new', async () => {
            await linkIvanov();
            await sessions.findOrCreateTelegram(IVANOV_ID);
            const recording = new RecordingFreeTextHandler([BotReplies.agentFailed()]);
            recording.hold();
            freeText = recording;
            const resetGeneration = vi.spyOn(queue, 'resetGeneration');

            await send('старый вопрос');
            await send('/new');
            recording.release();
            await settle();

            expect(resetGeneration).toHaveBeenCalledWith(BigInt(IVANOV_TG));
            expect(repliesToIvanov()).toEqual([BotReplies.dialogReset()]);
        });

        it('does not send the failure message of a work interrupted by /new', async () => {
            await linkIvanov();
            const recording = new RecordingFreeTextHandler();
            recording.hold();
            recording.failure = new Error('run cancelled');
            freeText = recording;

            await send('старый вопрос');
            await send('/new');
            recording.release();
            await settle();

            expect(repliesToIvanov()).toEqual([BotReplies.dialogReset()]);
        });

        it('does not ask the agent about a voice whose transcription was interrupted by /new', async () => {
            await linkIvanov();
            const recording = new RecordingFreeTextHandler(['Карточка задачи']);
            freeText = recording;
            let finishTranscription: () => void = () => undefined;
            transcriber = new FakeTranscriber(
                () =>
                    new Promise((resolve) => {
                        finishTranscription = () => {
                            resolve(TranscriptionResult.text(VOICE_TRANSCRIPT));
                        };
                    }),
            );

            await sendContent(voiceContent());
            await settle();
            await send('/new');
            finishTranscription();
            await settle();

            expect(transcriber.calls[0]?.signal.aborted).toBe(true);
            expect(recording.calls).toEqual([]);
            expect(await sessions.findTelegram(IVANOV_ID)).toBeNull();
            expect(repliesToIvanov()).toEqual([BotReplies.dialogReset()]);
        });

        it('aborts the agent call of the work interrupted by /new', async () => {
            await linkIvanov();
            const recording = new RecordingFreeTextHandler(['старый ответ']);
            recording.hold();
            freeText = recording;

            await send('старый вопрос');
            await send('/new');

            expect(recording.signals[0]?.aborted).toBe(true);
            recording.release();
            await settle();
        });

        it('takes the next message at once after /new, without waiting for the stale work', async () => {
            await linkIvanov();
            const recording = new RecordingFreeTextHandler(['ответ']);
            recording.hold();
            freeText = recording;

            await send('старый вопрос');
            await send('/new');
            await send('новый вопрос');
            recording.release();
            await settle();

            expect(recording.calls.map(({ text }) => text)).toEqual([
                'старый вопрос',
                'новый вопрос',
            ]);
            expect(repliesToIvanov()).toEqual([BotReplies.dialogReset(), 'ответ']);
        });

        it('answers /new from an unlinked chat with the linking instruction', async () => {
            await send('/new');

            expect(repliesToIvanov()).toEqual([BotReplies.notLinked()]);
        });
    });

    describe('failures', () => {
        it('logs a failed update with its update_id and does not rethrow', async () => {
            await linkIvanov();
            const errorLog = vi.spyOn(logger, 'error');
            messenger.failure = new Error('Telegram is down');
            const update = messageUpdate({
                updateId: 42,
                text: '/help секретный текст пользователя',
            });

            await expect(dispatcher().dispatch(update)).resolves.toBe('failed');

            expect(errorLog).toHaveBeenCalledTimes(1);
            expect(errorLog).toHaveBeenCalledWith(
                { err: messenger.failure, updateId: 42 },
                'Telegram update processing failed',
            );
            expect(inspect(errorLog.mock.calls, { depth: 5 })).not.toContain('секретный текст');
        });

        it('does not log the link token of a failed /start', async () => {
            const errorLog = vi.spyOn(logger, 'error');
            messenger.failure = new Error('Telegram is down');
            const token = await issueToken(IVANOV_ID);
            tokens.tokensByDigest.clear();

            await expect(send(`/start ${token}`)).resolves.toBe('failed');

            expect(inspect(errorLog.mock.calls, { depth: 5 })).not.toContain(token);
        });

        it('keeps processing the next updates after a failure', async () => {
            await linkIvanov();
            messenger.failure = new Error('Telegram is down');
            await send('/help');
            messenger.failure = null;

            await expect(send('/help')).resolves.toBe('handled');

            expect(repliesToIvanov()).toEqual([BotReplies.help('ivanov')]);
        });

        it('reports a deduplication failure as a failed update', async () => {
            const errorLog = vi.spyOn(logger, 'error');
            deduplicator.markProcessed = () => Promise.reject(new Error('Redis is down'));

            await expect(
                dispatcher().dispatch(messageUpdate({ updateId: 9, text: '/help' })),
            ).resolves.toBe('failed');
            expect(errorLog).toHaveBeenCalledWith(
                expect.objectContaining({ updateId: 9 }),
                'Telegram update processing failed',
            );
            expect(messenger.sent).toEqual([]);
        });
    });
});
