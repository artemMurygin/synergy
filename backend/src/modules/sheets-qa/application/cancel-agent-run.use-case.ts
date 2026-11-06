import { Injectable } from '@nestjs/common';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';

@Injectable()
export class CancelAgentRunUseCase {
    constructor(private readonly registry: ActiveRunRegistryPort) {}

    execute(threadId: string): Promise<void> {
        this.registry.cancel(threadId);
        return Promise.resolve();
    }
}
