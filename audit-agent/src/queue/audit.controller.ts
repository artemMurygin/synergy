import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ApiBody, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { zodToOpenApi } from '../common/zod-openapi';
import { AuditRunRepository } from '../database/audit-run.repository';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AUDIT_QUEUE } from './queue.constants';
import { CreateAuditDto, createAuditSchema } from './audit.dto';

@ApiTags('audits')
@Controller('audits')
export class AuditController {
    constructor(
        @InjectQueue(AUDIT_QUEUE) private readonly queue: Queue,
        private readonly runs: AuditRunRepository,
    ) {}

    @Post()
    @ApiOperation({ summary: 'Поставить аудит в очередь' })
    @ApiBody({ schema: zodToOpenApi(createAuditSchema) })
    async create(@Body(new ZodValidationPipe(createAuditSchema)) dto: CreateAuditDto) {
        const run = await this.runs.create(dto);
        await this.queue.add('run', { runId: run.id }, { jobId: run.id });
        return { id: run.id, status: run.status };
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить аудит по id' })
    @ApiNotFoundResponse({ description: 'Аудит не найден' })
    async get(@Param('id') id: string) {
        const run = await this.runs.findById(id);
        if (!run) throw new NotFoundException();
        return run;
    }
}
