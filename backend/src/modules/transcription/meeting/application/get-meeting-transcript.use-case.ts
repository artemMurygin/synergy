import { Injectable } from '@nestjs/common';
import { MeetingTranscriptRepositoryPort } from '../domain/ports/meeting-transcript-repository.port';
import { findOwnedTranscript } from './find-owned-transcript';
import {
    toMeetingTranscriptView,
    type MeetingTranscriptOfOwnerInput,
    type MeetingTranscriptView,
} from './meeting-transcript-view';

/** Статус и сегменты; не зависит от файла, поэтому работает и после его удаления. 404 — чужая. */
@Injectable()
export class GetMeetingTranscriptUseCase {
    constructor(private readonly transcripts: MeetingTranscriptRepositoryPort) {}

    async execute({
        ownerId,
        fileId,
    }: MeetingTranscriptOfOwnerInput): Promise<MeetingTranscriptView> {
        return toMeetingTranscriptView(
            await findOwnedTranscript(this.transcripts, ownerId, fileId),
        );
    }
}
