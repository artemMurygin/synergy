import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { Call } from '../../domain/entities/call.entity';
import { CallTranscript } from '../../domain/entities/call-transcript.entity';
import { CallTranscriptLine } from '../../domain/entities/call-transcript-line.entity';
import { CallId } from '../../domain/value-objects/call-id.value-object';
import { type CallRepositoryPort } from '../../domain/ports/call-repository.port';
import { type CallTranscriptRepositoryPort } from '../../domain/ports/call-transcript-repository.port';
import type {
    VocalAiCallDetailDto,
    VocalAiGatewayPort,
} from '../../domain/ports/vocal-ai-gateway.port';
import { CallNotFoundError } from '../../domain/errors';
import { GetCallTranscriptUseCase } from './get-call-transcript.use-case';

type MockedFn<T extends (...args: never[]) => unknown> = Mock<T>;

interface Fixture {
    callRepository: { findByFilter: MockedFn<CallRepositoryPort['findByFilter']> };
    transcriptRepository: {
        exists: MockedFn<CallTranscriptRepositoryPort['exists']>;
        save: MockedFn<CallTranscriptRepositoryPort['save']>;
        findByCallId: MockedFn<CallTranscriptRepositoryPort['findByCallId']>;
    };
    gateway: { getCall: MockedFn<VocalAiGatewayPort['getCall']> };
    useCase: GetCallTranscriptUseCase;
}

function buildCall(callId: CallId): Call {
    return Call.create({
        callId,
        projectId: 'project-1',
        manager: null,
        client: null,
        callType: null,
        callCreatedAt: null,
        callCompletedAt: null,
        scoredAt: null,
        rescoredAt: null,
        durationSeconds: null,
        totalScore: null,
        maxScore: null,
    });
}

function createFixture(): Fixture {
    const callRepository = {
        findByFilter: vi.fn<CallRepositoryPort['findByFilter']>().mockResolvedValue([]),
    };
    const transcriptRepository = {
        exists: vi.fn<CallTranscriptRepositoryPort['exists']>().mockResolvedValue(false),
        save: vi.fn<CallTranscriptRepositoryPort['save']>().mockResolvedValue(undefined),
        findByCallId: vi.fn<CallTranscriptRepositoryPort['findByCallId']>().mockResolvedValue(null),
    };
    const gateway = { getCall: vi.fn<VocalAiGatewayPort['getCall']>() };
    const useCase = new GetCallTranscriptUseCase(
        callRepository as unknown as CallRepositoryPort,
        transcriptRepository,
        gateway as unknown as VocalAiGatewayPort,
    );
    return { callRepository, transcriptRepository, gateway, useCase };
}

describe('GetCallTranscriptUseCase', () => {
    const callId = new CallId(42);
    const projectId = 'project-1';

    it('returns stored lines without calling the gateway when the transcript is already saved', async () => {
        const { callRepository, transcriptRepository, gateway, useCase } = createFixture();
        const line = new CallTranscriptLine({
            callId: 42,
            lineIndex: 0,
            speakerName: 'Иванов',
            speakerRole: 'manager',
            startTimeSeconds: 0,
            endTimeSeconds: 3,
            text: 'Здравствуйте',
        });
        transcriptRepository.exists.mockResolvedValue(true);
        transcriptRepository.findByCallId.mockResolvedValue(
            CallTranscript.create({ callId, lines: [line] }),
        );

        const result = await useCase.execute(callId, projectId);

        expect(result).toEqual([line]);
        expect(gateway.getCall).not.toHaveBeenCalled();
        expect(callRepository.findByFilter).not.toHaveBeenCalled();
    });

    it('fetches, saves and returns the transcript when it is not stored locally', async () => {
        const { callRepository, transcriptRepository, gateway, useCase } = createFixture();
        callRepository.findByFilter.mockResolvedValue([buildCall(callId)]);
        const line = new CallTranscriptLine({
            callId: 42,
            lineIndex: 0,
            speakerName: 'Клиент',
            speakerRole: 'client',
            startTimeSeconds: 0,
            endTimeSeconds: 2,
            text: 'Добрый день',
        });
        const detail: VocalAiCallDetailDto = {
            callId,
            projectId,
            manager: null,
            client: null,
            callType: null,
            callCreatedAt: null,
            callCompletedAt: null,
            scoredAt: null,
            rescoredAt: null,
            durationSeconds: null,
            totalScore: null,
            maxScore: null,
            metricScores: [],
            tags: [],
            summaries: [],
            transcriptLines: [line],
        };
        gateway.getCall.mockResolvedValue(detail);

        const result = await useCase.execute(callId, projectId);

        expect(gateway.getCall).toHaveBeenCalledWith(callId, projectId);
        expect(transcriptRepository.save).toHaveBeenCalledTimes(1);
        expect(result).toEqual([line]);
    });

    it('fetches the transcript using the projectId of the stored call, not the caller-supplied one', async () => {
        const { callRepository, gateway, useCase } = createFixture();
        const storedProjectId = 'project-1';
        const mismatchedArgProjectId = 'project-7';
        callRepository.findByFilter.mockResolvedValue([buildCall(callId)]);
        const line = new CallTranscriptLine({
            callId: 42,
            lineIndex: 0,
            speakerName: 'Клиент',
            speakerRole: 'client',
            startTimeSeconds: 0,
            endTimeSeconds: 2,
            text: 'Добрый день',
        });
        gateway.getCall.mockResolvedValue({
            callId,
            projectId: storedProjectId,
            manager: null,
            client: null,
            callType: null,
            callCreatedAt: null,
            callCompletedAt: null,
            scoredAt: null,
            rescoredAt: null,
            durationSeconds: null,
            totalScore: null,
            maxScore: null,
            metricScores: [],
            tags: [],
            summaries: [],
            transcriptLines: [line],
        });

        await useCase.execute(callId, mismatchedArgProjectId);

        expect(gateway.getCall).toHaveBeenCalledWith(callId, storedProjectId);
    });

    it('throws an explicit not-found error for an unknown callId instead of calling the gateway', async () => {
        const { gateway, useCase } = createFixture();

        await expect(useCase.execute(callId, projectId)).rejects.toThrow(CallNotFoundError);
        expect(gateway.getCall).not.toHaveBeenCalled();
    });
});
