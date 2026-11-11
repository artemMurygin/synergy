import type { AgentProfileId } from '../domain/agent-profile-id';
import { CLIENT_IDS, type ClientId } from '../domain/client-id';

export class UnknownClientError extends Error {
    constructor(client: unknown) {
        super(`No agent profile for client: ${String(client)}`);
    }
}

const DEFAULT_PROFILES: Readonly<Record<ClientId, AgentProfileId>> = {
    app: 'app',
    'manager-app': 'app',
    'employee-app': 'app',
    telegram: 'telegram',
};

/** Maps each client to its agent profile; a client without its own profile uses "app". */
export class ClientProfileRegistry {
    private readonly profiles: Readonly<Record<ClientId, AgentProfileId>>;

    constructor(overrides: Partial<Record<ClientId, AgentProfileId>> = {}) {
        this.profiles = { ...DEFAULT_PROFILES, ...overrides };
    }

    profileOf(client: ClientId): AgentProfileId {
        if (!CLIENT_IDS.includes(client)) throw new UnknownClientError(client);
        return this.profiles[client];
    }
}
