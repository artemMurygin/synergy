import { Injectable } from '@nestjs/common';
import type { Call } from '../../domain/entities/call.entity';
import { CallRepositoryPort, type CallFilter } from '../../domain/ports/call-repository.port';

export interface ListCallsResult {
    calls: Call[];
    totalCount: number;
    truncated: boolean;
}

@Injectable()
export class ListCallsUseCase {
    constructor(private readonly callRepository: CallRepositoryPort) {}

    async execute(filter: CallFilter): Promise<ListCallsResult> {
        const [calls, totalCount] = await Promise.all([
            this.callRepository.findByFilter(filter),
            this.callRepository.countByFilter(filter),
        ]);
        const truncated = (filter.offset ?? 0) + calls.length < totalCount;
        return { calls, totalCount, truncated };
    }
}
