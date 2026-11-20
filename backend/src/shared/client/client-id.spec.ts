import { describe, expect, it } from 'vitest';
import { ClientId, InvalidClientIdError } from './client-id';

describe('ClientId', () => {
    it.each(['app', 'manager-app', 'employee-app', 'telegram'])('accepts %s', (value) => {
        expect(ClientId.parse(value)).toBe(value);
    });

    it.each(['unknown-app', '', 'Manager-App', 42, undefined, null])('rejects %j', (value) => {
        expect(() => ClientId.parse(value)).toThrow(InvalidClientIdError);
    });

    it('tells the app clients from the telegram one', () => {
        expect(ClientId.isApp('app')).toBe(true);
        expect(ClientId.isApp('manager-app')).toBe(true);
        expect(ClientId.isApp('employee-app')).toBe(true);
        expect(ClientId.isApp('telegram')).toBe(false);
    });
});
