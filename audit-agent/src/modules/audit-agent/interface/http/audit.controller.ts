import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    CreateAuditResult,
    CreateAuditUseCase,
} from '../../application/audit/create-audit.use-case';
import { GetAuditUseCase } from '../../application/audit/get-audit.use-case';
import type { AuditRun } from '../../domain/audit/audit-run';
import { zodToOpenApi } from '../../../../shared/http/zod-openapi';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { CreateAuditDto, createAuditSchema } from './audit.dto';

@ApiTags('audits')
@Controller('audits')
export class AuditController {
    constructor(
        private readonly createAudit: CreateAuditUseCase,
        private readonly getAudit: GetAuditUseCase,
    ) {}

    @Post()
    @ApiOperation({ summary: 'Поставить аудит в очередь' })
    @ApiBody({ schema: zodToOpenApi(createAuditSchema) })
    create(
        @Body(new ZodValidationPipe(createAuditSchema)) dto: CreateAuditDto,
    ): Promise<CreateAuditResult> {
        return this.createAudit.execute(dto);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить аудит по id' })
    @ApiNotFoundResponse({ description: 'Аудит не найден' })
    get(@Param('id') id: string): Promise<AuditRun> {
        return this.getAudit.execute(id);
    }
}
