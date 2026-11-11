import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BaseError } from '../../../shared/errors';
import {
    MAX_VOICE_DURATION_SEC,
    MAX_VOICE_SIZE_BYTES,
    TranscribeVoiceUseCase,
} from '../../transcription/application/transcribe-voice.use-case';
import type { TranscriptionResult } from '../../transcription/domain/transcription-result';
import { VoiceClip } from '../../transcription/domain/voice-clip';
import type { VoiceMessageContent } from '../domain/message-content';
import { BotReplies } from './bot-replies';
import { BotFilesPort } from './ports/bot-files.port';

/** Telegram voice messages are ogg/opus; `mime_type` is optional in the Bot API. */
const TELEGRAM_VOICE_MIME_TYPE = 'audio/ogg';

/** The transcript to pass to the agent, or a ready bot reply explaining why there is none. */
export type VoiceTranscription =
    | { readonly kind: 'text'; readonly text: string }
    | { readonly kind: 'reply'; readonly text: string };

/**
 * Turns a voice message of a linked user into text for the agent: getFile, download, transcribe.
 * Limits known from the update are checked before downloading. Every failure becomes a reply,
 * nothing is thrown, and neither the audio nor the transcript reach the log.
 */
@Injectable()
export class VoiceMessageHandler {
    constructor(
        private readonly files: BotFilesPort,
        private readonly transcribeVoice: TranscribeVoiceUseCase,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(VoiceMessageHandler.name);
    }

    /** `cancel` stops the work when the user started a new dialog; the reply is then not sent. */
    async transcribe(
        voice: VoiceMessageContent,
        cancel?: AbortSignal,
    ): Promise<VoiceTranscription> {
        if (voice.durationSec > MAX_VOICE_DURATION_SEC) return reply(BotReplies.voiceTooLong());
        if (isTooLarge(voice.fileSize)) return reply(BotReplies.voiceTooLarge());

        const clip = await this.download(voice);
        if (clip === 'too-large') return reply(BotReplies.voiceTooLarge());
        if (clip === null) return reply(BotReplies.voiceUnavailable());

        if (cancel?.aborted === true) return reply(BotReplies.voiceUnavailable());
        return transcriptionOf(await this.transcribeVoice.execute(clip, cancel));
    }

    private async download(voice: VoiceMessageContent): Promise<VoiceClip | 'too-large' | null> {
        try {
            const file = await this.files.getFile(voice.fileId);
            if (isTooLarge(file.fileSize)) return 'too-large';
            const audio = await this.files.downloadFile(file.filePath);
            return VoiceClip.of({
                audio,
                mimeType: voice.mimeType ?? TELEGRAM_VOICE_MIME_TYPE,
                durationSec: voice.durationSec,
            });
        } catch (error: unknown) {
            this.logger.warn(
                { durationSec: voice.durationSec, err: sanitizedError(error) },
                'Telegram voice download failed',
            );
            return null;
        }
    }
}

function reply(text: string): VoiceTranscription {
    return { kind: 'reply', text };
}

function isTooLarge(sizeBytes: number | null): boolean {
    return sizeBytes !== null && sizeBytes > MAX_VOICE_SIZE_BYTES;
}

function transcriptionOf(result: TranscriptionResult): VoiceTranscription {
    switch (result.kind) {
        case 'text':
            return { kind: 'text', text: result.text };
        case 'no-speech':
            return reply(BotReplies.voiceNoSpeech());
        case 'rejected':
            switch (result.reason) {
                case 'too-long':
                    return reply(BotReplies.voiceTooLong());
                case 'too-large':
                    return reply(BotReplies.voiceTooLarge());
                case 'unsupported-format':
                case 'provider-unavailable':
                    return reply(BotReplies.voiceUnavailable());
            }
    }
}

/**
 * The error for the `err` log field without its message and stack: only the kind of failure
 * and its metadata (method, status, reason), never paths or tokens.
 */
function sanitizedError(error: unknown): { type: string; code?: string; metadata?: unknown } {
    if (error instanceof BaseError) {
        return { type: error.name, code: error.code, metadata: error.metadata };
    }
    return { type: error instanceof Error ? error.name : 'unknown' };
}
