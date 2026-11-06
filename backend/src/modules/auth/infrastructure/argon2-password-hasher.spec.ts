import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from './argon2-password-hasher';

describe('Argon2PasswordHasher', () => {
    const hasher = new Argon2PasswordHasher();

    it('verifies the right password and rejects a wrong one', async () => {
        const hash = await hasher.hash('Correct-Horse-1');
        expect(hash.value).toMatch(/^\$argon2id\$/);
        expect(await hasher.verify(hash, 'Correct-Horse-1')).toBe(true);
        expect(await hasher.verify(hash, 'other')).toBe(false);
    });

    it('uses a different salt for every hash', async () => {
        const a = await hasher.hash('same');
        const b = await hasher.hash('same');
        expect(a.value).not.toBe(b.value);
    });

    it('verifyDummy resolves without throwing', async () => {
        await expect(hasher.verifyDummy('anything')).resolves.toBeUndefined();
    });
});
