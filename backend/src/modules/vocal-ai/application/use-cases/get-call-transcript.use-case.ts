import { Injectable } from '@nestjs/common';
import { CallTranscript } from '../../domain/entities/call-transcript.entity';
import type { CallTranscriptLine } from '../../domain/entities/call-transcript-line.entity';
import { CallRepositoryPort } from '../../domain/ports/call-repository.port';
import { CallTranscriptRepositoryPort } from '../../domain/ports/call-transcript-repository.port';
import { VocalAiGatewayPort } from '../../domain/ports/vocal-ai-gateway.port';
import { CallId } from '../../domain/value-objects/call-id.value-object';
import { CallNotFoundError } from '../../domain/errors';

@Injectable()
export class GetCallTranscriptUseCase {
    constructor(
        private readonly callRepository: CallRepositoryPort,
        private readonly transcriptRepository: CallTranscriptRepositoryPort,
        private readonly vocalAiGateway: VocalAiGatewayPort,
    ) {}

    async execute(callId: CallId): Promise<readonly CallTranscriptLine[]> {
        if (await this.transcriptRepository.exists(callId)) {
            const transcript = await this.transcriptRepository.findByCallId(callId);
            if (transcript !== null) {
                return transcript.lines;
            }
        }

        const calls = await this.callRepository.findByFilter({ callId });
        if (calls.length === 0) {
            throw new CallNotFoundError(callId);
        }

        const detail = await this.vocalAiGateway.getCall(callId, calls[0].projectId);
        const transcript = CallTranscript.create({ callId, lines: detail.transcriptLines });
        await this.transcriptRepository.save(transcript);
        return transcript.lines;
    }
}
