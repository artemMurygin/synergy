import { Injectable } from '@nestjs/common';
import {
    CallRepositoryPort,
    type CallFilter,
    type CallStats,
} from '../../domain/ports/call-repository.port';

@Injectable()
export class GetCallStatsUseCase {
    constructor(private readonly callRepository: CallRepositoryPort) {}

    async execute(filter: CallFilter): Promise<CallStats> {
        return this.callRepository.aggregateStats(filter);
    }
}
