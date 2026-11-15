import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { Roles } from '../../../auth/interface/http/decorators';
import { ArchiveAgentUseCase } from '../../application/archive-agent.use-case';
import { GetArchiveUseCase } from '../../application/get-archive.use-case';
import { GetCatalogUseCase } from '../../application/get-catalog.use-case';
import { ArchiveResponse, CatalogResponse } from './catalog.responses';
import { AgentResponse } from './skills.responses';

const errorResponse = (status: HttpStatus, description: string): MethodDecorator =>
    ApiResponse({ status, description, type: ApiErrorResponse });

const unauthorized = errorResponse(HttpStatus.UNAUTHORIZED, 'Missing or invalid access token');
const forbidden = errorResponse(HttpStatus.FORBIDDEN, 'Requires the developer role');
const notFound = errorResponse(HttpStatus.NOT_FOUND, 'Agent not found');
const badRequest = errorResponse(HttpStatus.BAD_REQUEST, 'Invalid agent id');

@ApiTags('portal')
@ApiBearerAuth()
@Controller('portal')
export class CatalogController {
    constructor(
        private readonly getCatalog: GetCatalogUseCase,
        private readonly getArchive: GetArchiveUseCase,
        private readonly archiveAgent: ArchiveAgentUseCase,
    ) {}

    @Get('catalog')
    @ApiOperation({
        summary:
            'Catalog: products with their active agents (derived status) and skills (any signed-in user)',
    })
    @ApiResponse({ status: HttpStatus.OK, type: CatalogResponse })
    @unauthorized
    async catalog(): Promise<CatalogResponse> {
        return new CatalogResponse(await this.getCatalog.execute());
    }

    @Get('archive')
    @Roles('developer')
    @ApiOperation({ summary: 'Archived agents and skills (developer)' })
    @ApiResponse({ status: HttpStatus.OK, type: ArchiveResponse })
    @forbidden
    @unauthorized
    async archive(): Promise<ArchiveResponse> {
        return new ArchiveResponse(await this.getArchive.execute());
    }

    @Post('agents/:id/archive')
    @Roles('developer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Archive an agent in all its products; its skills stay as they are (developer)',
    })
    @ApiResponse({ status: HttpStatus.OK, type: AgentResponse })
    @badRequest
    @forbidden
    @notFound
    @unauthorized
    async archiveOne(@Param('id', ParseUUIDPipe) id: string): Promise<AgentResponse> {
        return new AgentResponse(await this.archiveAgent.archive(id));
    }

    @Post('agents/:id/restore')
    @Roles('developer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Restore an agent; separately archived skills stay archived (developer)',
    })
    @ApiResponse({ status: HttpStatus.OK, type: AgentResponse })
    @badRequest
    @forbidden
    @notFound
    @unauthorized
    async restore(@Param('id', ParseUUIDPipe) id: string): Promise<AgentResponse> {
        return new AgentResponse(await this.archiveAgent.restore(id));
    }
}
