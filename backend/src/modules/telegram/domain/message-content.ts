import { ArgumentInvalidError } from '../../../shared/errors';

export interface TextMessageContent {
    readonly kind: 'text';
    readonly text: string;
}

export interface VoiceMessageContent {
    readonly kind: 'voice';
    readonly fileId: string;
    readonly durationSec: number;
    readonly mimeType: string | null;
    readonly fileSize: number | null;
}

/** Anything the bot does not understand: photo, document, sticker, video, video note, audio file and the rest. */
export interface UnsupportedMessageContent {
    readonly kind: 'unsupported';
}

export type MessageContent = TextMessageContent | VoiceMessageContent | UnsupportedMessageContent;

export type VoiceMessageContentInput = Omit<VoiceMessageContent, 'kind'>;

export const MessageContent = {
    text(text: string): TextMessageContent {
        return { kind: 'text', text };
    },

    voice(input: VoiceMessageContentInput): VoiceMessageContent {
        if (input.fileId.length === 0) {
            throw new ArgumentInvalidError('Voice file id must not be empty');
        }
        if (!Number.isSafeInteger(input.durationSec) || input.durationSec < 0) {
            throw new ArgumentInvalidError('Voice duration must be a non-negative integer');
        }
        if (
            input.fileSize !== null &&
            (!Number.isSafeInteger(input.fileSize) || input.fileSize <= 0)
        ) {
            throw new ArgumentInvalidError('Voice file size must be a positive integer');
        }
        return {
            kind: 'voice',
            fileId: input.fileId,
            durationSec: input.durationSec,
            mimeType: input.mimeType,
            fileSize: input.fileSize,
        };
    },

    unsupported(): UnsupportedMessageContent {
        return { kind: 'unsupported' };
    },
};
