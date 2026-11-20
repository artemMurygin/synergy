import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { BotCommand } from '../domain/bot-command';
import type { BotSender, LinkedBotSender } from '../domain/bot-sender';
import {
    InvalidLinkTokenError,
    TelegramAccountTakenError,
    TelegramNotLinkedError,
} from '../domain/errors';
import { IncomingMessage } from '../domain/incoming-message';
import { MessageContent, type VoiceMessageContent } from '../domain/message-content';
import { TelegramIdentity } from '../domain/telegram-identity';
import { BotReplies } from './bot-replies';
import { ChatWorkQueue, type IsCurrentWork } from './chat-work-queue';
import { IdentityResolver } from './identity-resolver';
import { LinkAccountUseCase } from './link-account.use-case';
import { BotMessengerPort } from './ports/bot-messenger.port';
import { DialogResetPort } from './ports/dialog-reset.port';
import { FreeTextHandlerPort } from './ports/free-text-handler.port';
import { TelegramSettingsPort } from './ports/telegram-settings.port';
import { UpdateDeduplicatorPort } from './ports/update-deduplicator.port';
import { SetTelegramNotificationsUseCase } from './set-telegram-notifications.use-case';
import { UnlinkAccountUseCase } from './unlink-account.use-case';
import { VoiceMessageHandler } from './voice-message-handler';

export type DispatchOutcome = 'handled' | 'duplicate' | 'ignored' | 'failed';

const updateEnvelopeSchema = z.object({ update_id: z.number().int().nonnegative() });

const privateMessageSchema = z.object({
    message: z.object({
        chat: z.object({ id: z.number().int().positive(), type: z.literal('private') }),
        from: z.object({ id: z.number().int().positive(), username: z.string().optional() }),
    }),
});

const textContentSchema = z.object({ message: z.object({ text: z.string() }) });

const voiceContentSchema = z.object({
    message: z.object({
        voice: z.object({
            file_id: z.string().min(1),
            duration: z.number().int().nonnegative(),
            mime_type: z.string().optional(),
            file_size: z.number().int().positive().optional(),
        }),
    }),
});

const NO_BOT_USERNAME = '';

/** What a linked user sent to the agent: typed text or a voice to transcribe first. */
type AgentInput = { readonly kind: 'text'; readonly text: string } | VoiceMessageContent;

/** One message of a linked user processed in the background by the chat work queue. */
interface AgentWork {
    readonly chatId: bigint;
    readonly sender: LinkedBotSender;
    readonly input: AgentInput;
    readonly isCurrent: IsCurrentWork;
    readonly signal: AbortSignal;
}

/** Parses a private message update; returns null for anything that is not a private message. */
export function parseIncomingMessage(updateId: number, update: unknown): IncomingMessage | null {
    const parsed = privateMessageSchema.safeParse(update);
    if (!parsed.success) return null;
    const { chat, from } = parsed.data.message;
    return IncomingMessage.of({
        updateId,
        sender: TelegramIdentity.of({
            telegramUserId: BigInt(from.id),
            chatId: BigInt(chat.id),
            username: from.username ?? null,
        }),
        content: parseContent(update),
    });
}

function parseContent(update: unknown): MessageContent {
    const text = textContentSchema.safeParse(update);
    if (text.success) return MessageContent.text(text.data.message.text);
    const voice = voiceContentSchema.safeParse(update);
    if (!voice.success) return MessageContent.unsupported();
    const { file_id, duration, mime_type, file_size } = voice.data.message.voice;
    return MessageContent.voice({
        fileId: file_id,
        durationSec: duration,
        mimeType: mime_type ?? null,
        fileSize: file_size ?? null,
    });
}

/**
 * Routes a Telegram update. Commands are answered at once; text and voice of a linked user go
 * to the agent through the chat work queue, so the update is accepted before the agent answers.
 */
@Injectable()
export class BotUpdateDispatcher {
    constructor(
        private readonly deduplicator: UpdateDeduplicatorPort,
        private readonly resolver: IdentityResolver,
        private readonly linkAccount: LinkAccountUseCase,
        private readonly unlinkAccount: UnlinkAccountUseCase,
        private readonly setNotifications: SetTelegramNotificationsUseCase,
        private readonly dialogReset: DialogResetPort,
        private readonly freeText: FreeTextHandlerPort,
        private readonly voice: VoiceMessageHandler,
        private readonly queue: ChatWorkQueue,
        private readonly messenger: BotMessengerPort,
        private readonly settings: TelegramSettingsPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(BotUpdateDispatcher.name);
    }

    async dispatch(update: unknown): Promise<DispatchOutcome> {
        const envelope = updateEnvelopeSchema.safeParse(update);
        if (!envelope.success) return 'ignored';
        const updateId = envelope.data.update_id;
        try {
            const isFirstDelivery = await this.deduplicator.markProcessed(updateId);
            if (!isFirstDelivery) return 'duplicate';
            const message = parseIncomingMessage(updateId, update);
            if (message === null) return 'ignored';
            await this.handle(message);
            return 'handled';
        } catch (error: unknown) {
            this.logger.error({ err: error, updateId }, 'Telegram update processing failed');
            return 'failed';
        }
    }

    private async handle(message: IncomingMessage): Promise<void> {
        const { content } = message;
        const command =
            content.kind === 'text'
                ? BotCommand.parse(content.text, this.settings.botUsername ?? NO_BOT_USERNAME)
                : null;
        if (command?.name === 'start' && command.argument !== null) {
            await this.link(message, command.argument);
            return;
        }
        const sender = await this.resolver.resolve(message.sender);
        const replies = await this.repliesFor(message, sender, command);
        await this.sendAll(message.sender.chatId, replies);
    }

    private async repliesFor(
        message: IncomingMessage,
        sender: BotSender,
        command: BotCommand | null,
    ): Promise<readonly string[]> {
        if (sender.kind === 'anonymous') return [BotReplies.notLinked()];
        if (command !== null) {
            const reply = await this.commandReply(message.sender.chatId, sender, command);
            return reply === null ? [] : [reply];
        }
        const { content } = message;
        if (content.kind === 'unsupported') return [BotReplies.unsupportedMessage()];
        const isStarted = this.queue.tryRun(message.sender.chatId, (isCurrent, signal) =>
            this.answer({
                chatId: message.sender.chatId,
                sender,
                input: content,
                isCurrent,
                signal,
            }),
        );
        return isStarted ? [] : [BotReplies.stillProcessing()];
    }

    /**
     * The background work: transcribe a voice if needed, ask the agent, send the answer. After
     * /new the work is stale: it stops before asking the agent, so the old message never lands
     * in the new dialog.
     */
    private async answer(work: AgentWork): Promise<void> {
        const { chatId, sender, isCurrent, signal } = work;
        try {
            const text = await this.textForAgent(work);
            if (text === null || !isCurrent()) return;
            const parts = await this.freeText.handle(sender, text, signal);
            await this.sendWhileCurrent(chatId, parts, isCurrent);
        } catch (error: unknown) {
            this.logger.error({ err: error }, 'Telegram agent answer failed');
            await this.sendWhileCurrent(chatId, [BotReplies.agentFailed()], isCurrent);
        }
    }

    /** The text to pass to the agent; null when a voice was not transcribed and the reason was sent. */
    private async textForAgent(work: AgentWork): Promise<string | null> {
        const { chatId, input, isCurrent, signal } = work;
        if (input.kind === 'text') return input.text;
        const transcription = await this.voice.transcribe(input, signal);
        if (transcription.kind === 'reply') {
            await this.sendWhileCurrent(chatId, [transcription.text], isCurrent);
            return null;
        }
        return transcription.text;
    }

    /** Sends the parts in order and stops as soon as /new made the work stale. */
    private async sendWhileCurrent(
        chatId: bigint,
        parts: readonly string[],
        isCurrent: IsCurrentWork,
    ): Promise<void> {
        for (const part of parts) {
            if (!isCurrent()) return;
            await this.messenger.send(chatId, part);
        }
    }

    private async sendAll(chatId: bigint, parts: readonly string[]): Promise<void> {
        for (const part of parts) await this.messenger.send(chatId, part);
    }

    private async link(message: IncomingMessage, token: string): Promise<void> {
        const reply = await this.linkOrExplain(message.sender, token);
        if (reply !== null) await this.messenger.send(message.sender.chatId, reply);
    }

    private async linkOrExplain(identity: TelegramIdentity, token: string): Promise<string | null> {
        try {
            await this.linkAccount.execute({ token, identity });
            return null;
        } catch (error: unknown) {
            if (error instanceof InvalidLinkTokenError) return BotReplies.invalidLinkToken();
            if (error instanceof TelegramAccountTakenError) return BotReplies.accountTaken();
            throw error;
        }
    }

    private async commandReply(
        chatId: bigint,
        sender: LinkedBotSender,
        command: BotCommand,
    ): Promise<string | null> {
        switch (command.name) {
            case 'start':
            case 'help':
                return BotReplies.help(sender.login);
            case 'unlink':
                await this.unlinkAccount.execute(sender.userId);
                return null;
            case 'mute':
                return this.toggleNotifications(sender, false);
            case 'unmute':
                return this.toggleNotifications(sender, true);
            case 'new':
                // Stale and aborted first: the old message must not reach the new dialog.
                this.queue.resetGeneration(chatId);
                await this.dialogReset.reset(sender);
                return BotReplies.dialogReset();
        }
    }

    private async toggleNotifications(
        sender: LinkedBotSender,
        isEnabled: boolean,
    ): Promise<string> {
        try {
            await this.setNotifications.execute(
                sender.userId,
                isEnabled,
                sender.link.telegramUserId,
            );
        } catch (error: unknown) {
            if (error instanceof TelegramNotLinkedError) return BotReplies.notLinked();
            throw error;
        }
        return isEnabled ? BotReplies.notificationsEnabled() : BotReplies.notificationsDisabled();
    }
}
