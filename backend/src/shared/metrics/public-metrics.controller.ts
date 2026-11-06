import { Controller, Get, Res } from '@nestjs/common';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import type { Response } from 'express';
import { Public } from '../../modules/auth/interface/http/decorators';

@Public()
@Controller()
export class PublicMetricsController extends PrometheusController {
    @Get()
    override index(@Res({ passthrough: true }) response: Response): Promise<string> {
        return super.index(response);
    }
}
