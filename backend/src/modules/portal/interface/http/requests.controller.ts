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
import { AcceptRequestUseCase } from '../../application/accept-request.use-case';
import { GetRequestUseCase } from '../../application/get-request.use-case';
import { ListMyRequestsUseCase } from '../../application/list-my-requests.use-case';
import { ListQueueUseCase } from '../../application/list-queue.use-case';
import { RejectRequestUseCase } from '../../application/reject-request.use-case';
import { SubmitRequestUseCase } from '../../application/submit-request.use-case';
import { TakeRequestUseCase } from '../../application/take-request.use-case';
import { userOf } from './user-of';
import { RequestListResponse, RequestResponse } from './requests.responses';
import {
    type AcceptRequestBody,
    acceptRequestSchema,
    type PageQuery,
    pageQuerySchema,
    type RejectRequestBody,
    rejectRequestSchema,
    type SubmitRequestBody,
    submitRequestSchema,
} from './requests.schemas';

const errorResponse = (status: HttpStatus, description: string): MethodDecorator =>
    ApiResponse({ status, description, type: ApiErrorResponse });

const unauthorized = errorResponse(HttpStatus.UNAUTHORIZED, 'Missing or invalid access token');
const forbidden = errorResponse(HttpStatus.FORBIDDEN, 'Requires the developer role');
const notFound = errorResponse(HttpStatus.NOT_FOUND, 'Request, skill, agent or product not found');
const conflict = errorResponse(
    HttpStatus.CONFLICT,
    'The request was already taken or decided, is not taken yet, or the name/skill/agent is taken or archived (see code)',
);
const badRequest = errorResponse(HttpStatus.BAD_REQUEST, 'Invalid request');

@ApiTags('portal')
@ApiBearerAuth()
@Controller('portal')
export class RequestsController {
    constructor(
        private readonly submitRequest: SubmitRequestUseCase,
        private readonly listMyRequests: ListMyRequestsUseCase,
        private readonly getRequest: GetRequestUseCase,
        private readonly listQueue: ListQueueUseCase,
        private readonly acceptRequest: AcceptRequestUseCase,
        private readonly rejectRequest: RejectRequestUseCase,
        private readonly takeRequest: TakeRequestUseCase,
    ) {}

    @Post('requests')
    @ApiOperation({ summary: 'Submit an automation idea; the author is the token user' })
    @ApiBody({ schema: zodToOpenApi(submitRequestSchema) })
    @ApiResponse({ status: HttpStatus.CREATED, type: RequestResponse })
    @badRequest
    @unauthorized
    async submit(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Body(new ZodValidationPipe(submitRequestSchema)) body: SubmitRequestBody,
    ): Promise<RequestResponse> {
        const view = await this.submitRequest.execute({
            authorId: userOf(user).id,
            title: body.title,
            description: body.description,
            frequency: body.frequency,
            minutesPerRun: body.minutesPerRun,
            peopleCount: body.peopleCount,
        });
        return new RequestResponse(view);
    }

    @Get('requests/my')
    @ApiOperation({ summary: 'My requests, newest first' })
    @ApiResponse({ status: HttpStatus.OK, type: RequestListResponse })
    @badRequest
    @unauthorized
    async listMine(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery,
    ): Promise<RequestListResponse> {
        const result = await this.listMyRequests.execute({
            authorId: userOf(user).id,
            limit: query.limit,
            page: query.page,
        });
        return new RequestListResponse(result, query);
    }

    @Get('requests/:id')
    @ApiOperation({ summary: 'A request: the author or a developer; others get 404' })
    @ApiResponse({ status: HttpStatus.OK, type: RequestResponse })
    @badRequest
    @notFound
    @unauthorized
    async get(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<RequestResponse> {
        const actor = userOf(user);
        const view = await this.getRequest.execute({
            actorId: actor.id,
            roles: actor.roles,
            requestId: id,
        });
        return new RequestResponse(view);
    }

    @Get('queue')
    @Roles('developer')
    @ApiOperation({ summary: 'Requests in work (new and under review), oldest first (developer)' })
    @ApiResponse({ status: HttpStatus.OK, type: RequestListResponse })
    @badRequest
    @forbidden
    @unauthorized
    async queue(
        @Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery,
    ): Promise<RequestListResponse> {
        const result = await this.listQueue.execute({ limit: query.limit, page: query.page });
        return new RequestListResponse(result, query);
    }

    @Post('requests/:id/take')
    @Roles('developer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Take a new request into work: new -> under_review (developer)' })
    @ApiResponse({ status: HttpStatus.OK, type: RequestResponse })
    @badRequest
    @forbidden
    @notFound
    @conflict
    @unauthorized
    async take(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<RequestResponse> {
        const view = await this.takeRequest.execute({
            requestId: id,
            reviewerId: userOf(user).id,
        });
        return new RequestResponse(view);
    }

    @Post('requests/:id/accept')
    @Roles('developer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary:
            'Accept an in-work request with an estimate: into an existing skill, a new skill or a new agent (developer)',
    })
    @ApiBody({ schema: zodToOpenApi(acceptRequestSchema) })
    @ApiResponse({ status: HttpStatus.OK, type: RequestResponse })
    @badRequest
    @forbidden
    @notFound
    @conflict
    @unauthorized
    async accept(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(acceptRequestSchema)) body: AcceptRequestBody,
    ): Promise<RequestResponse> {
        const view = await this.acceptRequest.execute({
            requestId: id,
            decidedBy: userOf(user).id,
            effortHours: body.effortHours,
            target: body.target,
        });
        return new RequestResponse(view);
    }

    @Post('requests/:id/reject')
    @Roles('developer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Reject an in-work request with a required reason (developer)' })
    @ApiBody({ schema: zodToOpenApi(rejectRequestSchema) })
    @ApiResponse({ status: HttpStatus.OK, type: RequestResponse })
    @badRequest
    @forbidden
    @notFound
    @conflict
    @unauthorized
    async reject(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(rejectRequestSchema)) body: RejectRequestBody,
    ): Promise<RequestResponse> {
        const view = await this.rejectRequest.execute({
            requestId: id,
            decidedBy: userOf(user).id,
            reason: body.reason,
        });
        return new RequestResponse(view);
    }
}
