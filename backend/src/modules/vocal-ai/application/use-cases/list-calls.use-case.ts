import { Injectable } from '@nestjs/common';
import type { Call } from '../../domain/entities/call.entity';
import { CallRepositoryPort, type CallFilter } from '../../domain/ports/call-repository.port';

@Injectable()
export class ListCallsUseCase {
    constructor(private readonly callRepository: CallRepositoryPort) {}

    async execute(filter: CallFilter): Promise<Call[]> {
        return this.callRepository.findByFilter(filter);
    }
}
