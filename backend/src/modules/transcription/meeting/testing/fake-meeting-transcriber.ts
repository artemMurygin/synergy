import type { DiarizedTranscript } from '../domain/diarized-transcript';
import {
    MeetingTranscriberPort,
    type MeetingAudio,
    type MeetingTranscription,
} from '../domain/ports/meeting-transcriber.port';
import { TranscriptionUsage } from '../domain/transcription-usage';

type Behaviour = (audio: MeetingAudio, signal: AbortSignal) => Promise<DiarizedTranscript>;

/** Провайдер-двойник: отвечает заданным поведением и запоминает вызовы. */
export class FakeMeetingTranscriber extends MeetingTranscriberPort {
    readonly calls: { audio: MeetingAudio; signal: AbortSignal }[] = [];

    constructor(
        private readonly behaviour: Behaviour,
        private readonly usage: TranscriptionUsage = TranscriptionUsage.zero(),
    ) {
        super();
    }

    static answering(
        transcript: DiarizedTranscript,
        usage?: TranscriptionUsage,
    ): FakeMeetingTranscriber {
        return new FakeMeetingTranscriber(() => Promise.resolve(transcript), usage);
    }

    static failing(error: Error): FakeMeetingTranscriber {
        return new FakeMeetingTranscriber(() => Promise.reject(error));
    }

    async transcribe(audio: MeetingAudio, signal: AbortSignal): Promise<MeetingTranscription> {
        this.calls.push({ audio, signal });
        return { transcript: await this.behaviour(audio, signal), usage: this.usage };
    }
}
