import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { zodToOpenApi } from '../../../../shared/http/zod-openapi';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import {
    CurrentUser,
    Roles,
    type AuthenticatedUser,
} from '../../../auth/interface/http/decorators';
import { ChangeBugStatusUseCase } from '../../application/change-bug-status.use-case';
import { GetBugUseCase } from '../../application/get-bug.use-case';
import { ListBugQueueUseCase } from '../../application/list-bug-queue.use-case';
import { ListMyBugsUseCase } from '../../application/list-my-bugs.use-case';
import { ReportBugUseCase } from '../../application/report-bug.use-case';
import { BugListResponse, BugResponse } from './bugs.responses';
import {
    type BugPageQuery,
    bugPageQuerySchema,
    type BugQueueQuery,
    bugQueueQuerySchema,
    type ChangeBugStatusBody,
    changeBugStatusSchema,
    type ReportBugBody,
    reportBugSchema,
} from './bugs.schemas';
import { userOf } from './user-of';

const errorResponse = (status: HttpStatus, description: string): MethodDecorator =>
    ApiResponse({ status, description, type: ApiErrorResponse });

const unauthorized = errorResponse(HttpStatus.UNAUTHORIZED, 'Missing or invalid access token');
const forbidden = errorResponse(HttpStatus.FORBIDDEN, 'Requires the developer role');
const badRequest = errorResponse(HttpStatus.BAD_REQUEST, 'Invalid request');
const notFound = errorResponse(HttpStatus.NOT_FOUND, 'Bug, agent or product not found');
const conflict = errorResponse(
    HttpStatus.CONFLICT,
    'The status transition is not allowed or the status has already changed, or the agent is archived (see code)',
);

// Маршруты `my` и `queue` объявлены до `:id`, иначе они попадут под параметр.
// Невалидный UUID в `:id` не отсекаем пайпом: это «не найдено» (404), как в use case'ах.
@ApiTags('portal')
@ApiBearerAuth()
@Controller('portal/bugs')
export class BugsController {
    constructor(
        private readonly reportBug: ReportBugUseCase,
        private readonly listMyBugs: ListMyBugsUseCase,
        private readonly listBugQueue: ListBugQueueUseCase,
        private readonly getBug: GetBugUseCase,
        private readonly changeBugStatus: ChangeBugStatusUseCase,
    ) {}

    @Post()
    @ApiOperation({ summary: 'Report a bug on an agent; the author is the token user' })
    @ApiBody({ schema: zodToOpenApi(reportBugSchema) })
    @ApiResponse({ status: HttpStatus.CREATED, type: BugResponse })
    @badRequest
    @notFound
    @conflict
    @unauthorized
    async report(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Body(new ZodValidationPipe(reportBugSchema)) body: ReportBugBody,
    ): Promise<BugResponse> {
        const actor = userOf(user);
        const view = await this.reportBug.execute({
            actorId: actor.id,
            roles: actor.roles,
            title: body.title,
            description: body.description,
            productId: body.productId,
            agentId: body.agentId,
        });
        return new BugResponse(view);
    }

    @Get('my')
    @ApiOperation({ summary: 'My bugs, newest first' })
    @ApiResponse({ status: HttpStatus.OK, type: BugListResponse })
    @badRequest
    @unauthorized
    async listMine(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Query(new ZodValidationPipe(bugPageQuerySchema)) query: BugPageQuery,
    ): Promise<BugListResponse> {
        const result = await this.listMyBugs.execute({
            authorId: userOf(user).id,
            page: { limit: query.limit, page: query.page },
        });
        return new BugListResponse(result, query);
    }

    @Get('queue')
    @Roles('developer')
    @ApiOperation({ summary: 'Bug queue with an optional status filter (developer)' })
    @ApiResponse({ status: HttpStatus.OK, type: BugListResponse })
    @badRequest
    @forbidden
    @unauthorized
    async queue(
        @Query(new ZodValidationPipe(bugQueueQuerySchema)) query: BugQueueQuery,
    ): Promise<BugListResponse> {
        const result = await this.listBugQueue.execute({
            status: query.status ?? null,
            page: { limit: query.limit, page: query.page },
        });
        return new BugListResponse(result, query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'A bug: the author or a developer; others get 404' })
    @ApiResponse({ status: HttpStatus.OK, type: BugResponse })
    @notFound
    @unauthorized
    async get(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id') id: string,
    ): Promise<BugResponse> {
        const actor = userOf(user);
        const view = await this.getBug.execute({
            bugId: id,
            actorId: actor.id,
            roles: actor.roles,
        });
        return new BugResponse(view);
    }

    @Post(':id/status')
    @Roles('developer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Change the bug status; wont_fix requires a reason (developer)' })
    @ApiBody({ schema: zodToOpenApi(changeBugStatusSchema) })
    @ApiResponse({ status: HttpStatus.OK, type: BugResponse })
    @badRequest
    @forbidden
    @notFound
    @conflict
    @unauthorized
    async changeStatus(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id') id: string,
        @Body(new ZodValidationPipe(changeBugStatusSchema)) body: ChangeBugStatusBody,
    ): Promise<BugResponse> {
        const actor = userOf(user);
        const view = await this.changeBugStatus.execute({
            bugId: id,
            actorId: actor.id,
            roles: actor.roles,
            status: body.status,
            reason: body.reason ?? null,
        });
        return new BugResponse(view);
    }
}
