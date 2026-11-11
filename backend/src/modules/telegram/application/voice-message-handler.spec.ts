import { beforeEach, describe, expect, it } from 'vitest';
import { FakeTranscriber, recordingLogger } from '../../transcription/application/test-doubles';
import {
    MAX_VOICE_DURATION_SEC,
    MAX_VOICE_SIZE_BYTES,
    TranscribeVoiceUseCase,
} from '../../transcription/application/transcribe-voice.use-case';
import { TranscriptionResult } from '../../transcription/domain/transcription-result';
import { MessageContent, type VoiceMessageContent } from '../domain/message-content';
import { BotApiRejectedError, TransientDeliveryError } from './errors';
import { BotReplies } from './bot-replies';
import { InMemoryBotFiles, silentLogger } from './test-doubles';
import { VoiceMessageHandler } from './voice-message-handler';

const FILE_ID = 'voice-file-1';
const FILE_PATH = 'voice/file_1.oga';
const AUDIO = Buffer.from('OggS-fake-opus-payload');

function voice(overrides: Partial<Omit<VoiceMessageContent, 'kind'>> = {}): VoiceMessageContent {
    return MessageContent.voice({
        fileId: FILE_ID,
        durationSec: 12,
        mimeType: 'audio/ogg',
        fileSize: AUDIO.byteLength,
        ...overrides,
    });
}

describe('VoiceMessageHandler', () => {
    let files: InMemoryBotFiles;
    let transcriber: FakeTranscriber;

    function handler(): VoiceMessageHandler {
        return new VoiceMessageHandler(
            files,
            new TranscribeVoiceUseCase(transcriber, silentLogger()),
            silentLogger(),
        );
    }

    beforeEach(() => {
        files = new InMemoryBotFiles();
        files.add(FILE_ID, { filePath: FILE_PATH, fileSize: AUDIO.byteLength, content: AUDIO });
        transcriber = FakeTranscriber.answering(
            TranscriptionResult.text('Поставь Ивану задачу позвонить клиенту завтра'),
        );
    });

    it('downloads the voice and returns the transcript as the text for the agent', async () => {
        const result = await handler().transcribe(voice());

        expect(result).toEqual({
            kind: 'text',
            text: 'Поставь Ивану задачу позвонить клиенту завтра',
        });
        expect(files.getFileCalls).toEqual([FILE_ID]);
        expect(files.downloadCalls).toEqual([FILE_PATH]);
        expect(transcriber.calls).toHaveLength(1);
        expect(transcriber.calls[0]?.clip.audio).toBe(AUDIO);
        expect(transcriber.calls[0]?.clip.durationSec).toBe(12);
        expect(transcriber.calls[0]?.clip.mimeType).toBe('audio/ogg');
    });

    it('treats a voice without a mime type as Telegram ogg', async () => {
        await handler().transcribe(voice({ mimeType: null }));

        expect(transcriber.calls[0]?.clip.mimeType).toBe('audio/ogg');
    });

    it('rejects a voice longer than 3 minutes by its duration without downloading it', async () => {
        const result = await handler().transcribe(
            voice({ durationSec: MAX_VOICE_DURATION_SEC + 1 }),
        );

        expect(result).toEqual({ kind: 'reply', text: BotReplies.voiceTooLong() });
        expect(files.getFileCalls).toEqual([]);
        expect(files.downloadCalls).toEqual([]);
        expect(transcriber.calls).toEqual([]);
    });

    it('accepts a voice of exactly 3 minutes', async () => {
        const result = await handler().transcribe(voice({ durationSec: MAX_VOICE_DURATION_SEC }));

        expect(result.kind).toBe('text');
    });

    it('rejects a voice larger than 5 MB by the size from Telegram without downloading it', async () => {
        const result = await handler().transcribe(voice({ fileSize: MAX_VOICE_SIZE_BYTES + 1 }));

        expect(result).toEqual({ kind: 'reply', text: BotReplies.voiceTooLarge() });
        expect(files.downloadCalls).toEqual([]);
        expect(transcriber.calls).toEqual([]);
    });

    it('rejects a voice whose file turns out larger than 5 MB in getFile without downloading it', async () => {
        files.add(FILE_ID, {
            filePath: FILE_PATH,
            fileSize: MAX_VOICE_SIZE_BYTES + 1,
            content: AUDIO,
        });

        const result = await handler().transcribe(voice({ fileSize: null }));

        expect(result).toEqual({ kind: 'reply', text: BotReplies.voiceTooLarge() });
        expect(files.downloadCalls).toEqual([]);
    });

    it('maps the too-large rejection of the transcription to the too-large reply', async () => {
        files.add(FILE_ID, {
            filePath: FILE_PATH,
            fileSize: null,
            content: Buffer.alloc(MAX_VOICE_SIZE_BYTES + 1, 1),
        });

        const result = await handler().transcribe(voice({ fileSize: null }));

        expect(result).toEqual({ kind: 'reply', text: BotReplies.voiceTooLarge() });
        expect(transcriber.calls).toEqual([]);
    });

    it('answers that the speech was not recognized when there is no speech', async () => {
        transcriber = FakeTranscriber.answering(TranscriptionResult.noSpeech());

        const result = await handler().transcribe(voice());

        expect(result).toEqual({ kind: 'reply', text: BotReplies.voiceNoSpeech() });
    });

    it('answers that voices are unavailable when the provider fails', async () => {
        transcriber = FakeTranscriber.failing(new Error('provider down'));

        const result = await handler().transcribe(voice());

        expect(result).toEqual({ kind: 'reply', text: BotReplies.voiceUnavailable() });
    });

    it('answers that voices are unavailable when the format is not supported', async () => {
        const result = await handler().transcribe(voice({ mimeType: 'video/mp4' }));

        expect(result).toEqual({ kind: 'reply', text: BotReplies.voiceUnavailable() });
        expect(transcriber.calls).toEqual([]);
    });

    it.each([
        ['getFile', new BotApiRejectedError('Bot API getFile responded with 400 (rejected)')],
        ['downloadFile', new TransientDeliveryError('Bot API downloadFile request failed')],
    ])(
        'answers that voices are unavailable when %s fails, without transcribing',
        async (step, error) => {
            if (step === 'getFile') files.getFileFailure = error;
            else files.downloadFailure = error;

            const result = await handler().transcribe(voice());

            expect(result).toEqual({ kind: 'reply', text: BotReplies.voiceUnavailable() });
            expect(transcriber.calls).toEqual([]);
        },
    );

    it('answers that voices are unavailable when the downloaded file is empty', async () => {
        files.add(FILE_ID, { filePath: FILE_PATH, fileSize: null, content: Buffer.alloc(0) });

        const result = await handler().transcribe(voice({ fileSize: null }));

        expect(result).toEqual({ kind: 'reply', text: BotReplies.voiceUnavailable() });
        expect(transcriber.calls).toEqual([]);
    });

    it('logs a download failure without the file id, the path or the audio', async () => {
        const log = recordingLogger();
        files.downloadFailure = new TransientDeliveryError('Bot API downloadFile request failed');

        await new VoiceMessageHandler(
            files,
            new TranscribeVoiceUseCase(transcriber, silentLogger()),
            log.logger,
        ).transcribe(voice());

        expect(log.warn).toHaveBeenCalledTimes(1);
        const dump = log.dump();
        expect(dump).not.toContain(FILE_ID);
        expect(dump).not.toContain(FILE_PATH);
        expect(dump).not.toContain(AUDIO.toString('base64'));
    });
});
