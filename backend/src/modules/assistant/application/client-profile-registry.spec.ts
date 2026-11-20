import { describe, expect, it } from 'vitest';
import type { AgentProfileId } from '../domain/agent-profile-id';
import type { ClientId } from '../../../shared/http/client-id';
import { ClientProfileRegistry, UnknownClientError } from './client-profile-registry';

describe('ClientProfileRegistry', () => {
    const registry = new ClientProfileRegistry();

    it.each<[ClientId, AgentProfileId]>([
        ['app', 'app'],
        ['manager-app', 'app'],
        ['employee-app', 'app'],
        ['telegram', 'telegram'],
    ])('maps %s to the %s profile', (client, profile) => {
        expect(registry.profileOf(client)).toBe(profile);
    });

    it('lets a client get its own profile without touching the others', () => {
        const custom = new ClientProfileRegistry({ 'employee-app': 'telegram' });
        expect(custom.profileOf('employee-app')).toBe('telegram');
        expect(custom.profileOf('manager-app')).toBe('app');
    });

    it('fails on a client outside the registry', () => {
        expect(() => registry.profileOf('unknown-app' as ClientId)).toThrow(UnknownClientError);
    });
});
