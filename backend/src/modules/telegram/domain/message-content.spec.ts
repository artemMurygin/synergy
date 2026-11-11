import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { MessageContent } from './message-content';

describe('MessageContent', () => {
    it('keeps the text of a text message', () => {
        expect(MessageContent.text('Поставь задачу')).toEqual({
            kind: 'text',
            text: 'Поставь задачу',
        });
    });

    it('keeps the file, the duration, the type and the size of a voice message', () => {
        expect(
            MessageContent.voice({
                fileId: 'AwACAgIAAxkBAAIB',
                durationSec: 12,
                mimeType: 'audio/ogg',
                fileSize: 48_000,
            }),
        ).toEqual({
            kind: 'voice',
            fileId: 'AwACAgIAAxkBAAIB',
            durationSec: 12,
            mimeType: 'audio/ogg',
            fileSize: 48_000,
        });
    });

    it('accepts a voice message without the type and the size', () => {
        expect(
            MessageContent.voice({ fileId: 'f', durationSec: 0, mimeType: null, fileSize: null }),
        ).toMatchObject({ kind: 'voice', mimeType: null, fileSize: null });
    });

    it.each([
        ['an empty file id', { fileId: '', durationSec: 1, mimeType: null, fileSize: null }],
        ['a negative duration', { fileId: 'f', durationSec: -1, mimeType: null, fileSize: null }],
        [
            'a fractional duration',
            { fileId: 'f', durationSec: 1.5, mimeType: null, fileSize: null },
        ],
        ['a zero size', { fileId: 'f', durationSec: 1, mimeType: null, fileSize: 0 }],
    ])('rejects a voice message with %s', (_case, input) => {
        expect(() => MessageContent.voice(input)).toThrow(ArgumentInvalidError);
    });

    it('marks any other content as unsupported', () => {
        expect(MessageContent.unsupported()).toEqual({ kind: 'unsupported' });
    });
});
