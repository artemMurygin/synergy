import { describe, expect, it } from 'vitest';
import { Actor, InvalidActorError } from './actor';

describe('Actor', () => {
    it('carries the user id', () => {
        expect(Actor.of('u1').userId).toBe('u1');
    });

    it('rejects an empty user id', () => {
        expect(() => Actor.of('')).toThrow(InvalidActorError);
        expect(() => Actor.of('  ')).toThrow(InvalidActorError);
    });
});
