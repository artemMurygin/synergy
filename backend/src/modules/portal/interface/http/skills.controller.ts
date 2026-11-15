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
import { ArchiveSkillUseCase } from '../../application/archive-skill.use-case';
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
        private readonly archiveSkill: ArchiveSkillUseCase,
    ) {}

    @Get('agents')
    @ApiOperation({ summary: 'Active agents with their products (any signed-in user)' })
    @ApiResponse({ status: HttpStatus.OK, type: [AgentResponse] })
    @unauthorized
    async agents(): Promise<AgentResponse[]> {
        const agents = await this.listAgentsUseCase.execute();
        return agents.map((item) => AgentResponse.fromListItem(item));
    }

    @Get('skills')
    @Roles('developer')
    @ApiOperation({
        summary: 'Active skills with an optional status filter, incl. rework (developer)',
    })
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
    @ApiOperation({
        summary: 'Move a skill to an allowed next status, see nextStatuses (developer)',
    })
    @ApiBody({ schema: zodToOpenApi(changeSkillStatusSchema) })
    @ApiResponse({ status: HttpStatus.OK, type: SkillResponse })
    @badRequest
    @forbidden
    @notFound
    @errorResponse(
        HttpStatus.CONFLICT,
        'Transition not allowed, or the skill or its agent is archived',
    )
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

    @Post('skills/:id/archive')
    @Roles('developer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Archive a skill; repeating is a no-op (developer)' })
    @ApiResponse({ status: HttpStatus.OK, type: SkillResponse })
    @badRequest
    @forbidden
    @notFound
    @unauthorized
    async archive(@Param('id', ParseUUIDPipe) id: string): Promise<SkillResponse> {
        return new SkillResponse(await this.archiveSkill.archive(id));
    }

    @Post('skills/:id/restore')
    @Roles('developer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Restore a skill; repeating is a no-op (developer)' })
    @ApiResponse({ status: HttpStatus.OK, type: SkillResponse })
    @badRequest
    @forbidden
    @notFound
    @errorResponse(HttpStatus.CONFLICT, 'The skill agent is archived: restore the agent first')
    @unauthorized
    async restore(@Param('id', ParseUUIDPipe) id: string): Promise<SkillResponse> {
        return new SkillResponse(await this.archiveSkill.restore(id));
    }
}
