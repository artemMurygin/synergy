import { describe, expect, it } from 'vitest';
import { IS_PUBLIC } from '../../modules/auth/interface/http/decorators';
import { HealthController } from './health.controller';

describe('HealthController', () => {
    it('stays public when every other route requires a token', () => {
        expect(Reflect.getMetadata(IS_PUBLIC, HealthController)).toBe(true);
    });
});
