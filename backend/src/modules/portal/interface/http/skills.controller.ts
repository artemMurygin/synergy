import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { zodToOpenApi } from '../../../../shared/http/zod-openapi';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import {
    CurrentUser,
    Roles,
    type AuthenticatedUser,
} from '../../../auth/interface/http/decorators';
import { ChangeSkillStatusUseCase } from '../../application/change-skill-status.use-case';
import { CreateSkillUseCase } from '../../application/create-skill.use-case';
import { ListAgentsUseCase } from '../../application/list-agents.use-case';
import { ListSkillsUseCase } from '../../application/list-skills.use-case';
import { userOf } from './user-of';
import {
    type ChangeSkillStatusBody,
    changeSkillStatusSchema,
    type CreateSkillBody,
    createSkillSchema,
    type ListSkillsQuery,
    listSkillsQuerySchema,
} from './skills.schemas';
import { AgentResponse, SkillListResponse, SkillResponse } from './skills.responses';

const errorResponse = (status: HttpStatus, description: string): MethodDecorator =>
    ApiResponse({ status, description, type: ApiErrorResponse });

const unauthorized = errorResponse(HttpStatus.UNAUTHORIZED, 'Missing or invalid access token');
const forbidden = errorResponse(HttpStatus.FORBIDDEN, 'Requires the developer role');
const notFound = errorResponse(HttpStatus.NOT_FOUND, 'Skill or agent not found');
const badRequest = errorResponse(HttpStatus.BAD_REQUEST, 'Invalid request');

@ApiTags('portal')
@ApiBearerAuth()
@Controller('portal')
export class SkillsController {
    constructor(
        private readonly listAgentsUseCase: ListAgentsUseCase,
        private readonly listSkillsUseCase: ListSkillsUseCase,
        private readonly createSkillUseCase: CreateSkillUseCase,
        private readonly changeSkillStatus: ChangeSkillStatusUseCase,
    ) {}

    @Get('agents')
    @ApiOperation({ summary: 'Agents with their products (any signed-in user)' })
    @ApiResponse({ status: HttpStatus.OK, type: [AgentResponse] })
    @unauthorized
    async agents(): Promise<AgentResponse[]> {
        const agents = await this.listAgentsUseCase.execute();
        return agents.map((item) => new AgentResponse(item));
    }

    @Get('skills')
    @Roles('developer')
    @ApiOperation({ summary: 'Skills with an optional status filter (developer)' })
    @ApiResponse({ status: HttpStatus.OK, type: SkillListResponse })
    @badRequest
    @forbidden
    @unauthorized
    async list(
        @Query(new ZodValidationPipe(listSkillsQuerySchema)) query: ListSkillsQuery,
    ): Promise<SkillListResponse> {
        const result = await this.listSkillsUseCase.execute({
            ...(query.status === undefined ? {} : { status: query.status }),
            limit: query.limit,
            page: query.page,
        });
        return new SkillListResponse(result, query);
    }

    @Post('skills')
    @Roles('developer')
    @ApiOperation({ summary: 'Create a skill in status planned (developer)' })
    @ApiBody({ schema: zodToOpenApi(createSkillSchema) })
    @ApiResponse({ status: HttpStatus.CREATED, type: SkillResponse })
    @badRequest
    @forbidden
    @notFound
    @unauthorized
    async create(
        @Body(new ZodValidationPipe(createSkillSchema)) body: CreateSkillBody,
    ): Promise<SkillResponse> {
        return new SkillResponse(await this.createSkillUseCase.execute(body));
    }

    @Post('skills/:id/status')
    @Roles('developer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Move a skill to the next status (developer)' })
    @ApiBody({ schema: zodToOpenApi(changeSkillStatusSchema) })
    @ApiResponse({ status: HttpStatus.OK, type: SkillResponse })
    @badRequest
    @forbidden
    @notFound
    @errorResponse(HttpStatus.CONFLICT, 'Only the adjacent forward transition is allowed')
    @unauthorized
    async changeStatus(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(changeSkillStatusSchema)) body: ChangeSkillStatusBody,
    ): Promise<SkillResponse> {
        const view = await this.changeSkillStatus.execute({
            skillId: id,
            to: body.status,
            changedBy: userOf(user).id,
        });
        return new SkillResponse(view);
    }
}
