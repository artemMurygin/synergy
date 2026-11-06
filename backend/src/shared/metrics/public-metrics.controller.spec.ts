import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { IS_PUBLIC } from '../../modules/auth/interface/http/decorators';
import { PublicMetricsController } from './public-metrics.controller';

describe('PublicMetricsController', () => {
    it('помечен @Public, чтобы Prometheus мог снимать метрики без токена', () => {
        expect(new Reflector().get(IS_PUBLIC, PublicMetricsController)).toBe(true);
    });
});
