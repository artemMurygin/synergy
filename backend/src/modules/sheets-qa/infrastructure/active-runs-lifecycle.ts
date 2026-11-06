import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';

/** Cancels active agent runs when the process stops gracefully. */
@Injectable()
export class ActiveRunsLifecycle implements OnApplicationShutdown {
    constructor(private readonly registry: ActiveRunRegistryPort) {}

    onApplicationShutdown(): void {
        this.registry.cancelAll();
    }
}
