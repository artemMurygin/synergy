import { Body, Controller, Get, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { zodToOpenApi } from '../../../../shared/http/zod-openapi';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '../../../auth/interface/http/decorators';
import { EditBugCommentUseCase } from '../../application/edit-bug-comment.use-case';
import { ListBugCommentsUseCase } from '../../application/list-bug-comments.use-case';
import { PostBugCommentUseCase } from '../../application/post-bug-comment.use-case';
import { BugCommentListResponse, BugCommentResponse } from './bug-comments.responses';
import {
    type EditCommentBody,
    editCommentSchema,
    type PostCommentBody,
    postCommentSchema,
} from './comments.schemas';
import { userOf } from './user-of';

const errorResponse = (status: HttpStatus, description: string): MethodDecorator =>
    ApiResponse({ status, description, type: ApiErrorResponse });

const unauthorized = errorResponse(HttpStatus.UNAUTHORIZED, 'Missing or invalid access token');
const badRequest = errorResponse(HttpStatus.BAD_REQUEST, 'Empty or too long comment text');
const notFound = errorResponse(
    HttpStatus.NOT_FOUND,
    'Bug not found or not accessible, or comment not found in this bug',
);
const forbidden = errorResponse(HttpStatus.FORBIDDEN, 'The comment belongs to another user');
const conflict = errorResponse(HttpStatus.CONFLICT, 'The 15-minute edit window has expired');

// Без @Roles: доступ к багу проверяет BugAccessPolicy (автор или разработчик), чужим — 404.
// Идентификаторы не проходят ParseUUIDPipe: невалидный UUID — это «не найдено» (404), как в use case'ах.
@ApiTags('portal')
@ApiBearerAuth()
@Controller('portal/bugs/:id/comments')
export class BugCommentsController {
    constructor(
        private readonly listComments: ListBugCommentsUseCase,
        private readonly postComment: PostBugCommentUseCase,
        private readonly editComment: EditBugCommentUseCase,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Comment feed of a bug, oldest first: the author or a developer' })
    @ApiResponse({ status: HttpStatus.OK, type: BugCommentListResponse })
    @notFound
    @unauthorized
    async list(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id') id: string,
    ): Promise<BugCommentListResponse> {
        const actor = userOf(user);
        const views = await this.listComments.execute({
            bugId: id,
            actorId: actor.id,
            roles: actor.roles,
        });
        return new BugCommentListResponse(views);
    }

    @Post()
    @ApiOperation({ summary: 'Add a comment to a bug in any status' })
    @ApiBody({ schema: zodToOpenApi(postCommentSchema) })
    @ApiResponse({ status: HttpStatus.CREATED, type: BugCommentResponse })
    @badRequest
    @notFound
    @unauthorized
    async post(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id') id: string,
        @Body(new ZodValidationPipe(postCommentSchema)) body: PostCommentBody,
    ): Promise<BugCommentResponse> {
        const actor = userOf(user);
        const view = await this.postComment.execute({
            bugId: id,
            actorId: actor.id,
            roles: actor.roles,
            body: body.body,
        });
        return new BugCommentResponse(view);
    }

    @Patch(':commentId')
    @ApiOperation({ summary: 'Edit own comment within 15 minutes of posting' })
    @ApiBody({ schema: zodToOpenApi(editCommentSchema) })
    @ApiResponse({ status: HttpStatus.OK, type: BugCommentResponse })
    @badRequest
    @forbidden
    @notFound
    @conflict
    @unauthorized
    async edit(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id') id: string,
        @Param('commentId') commentId: string,
        @Body(new ZodValidationPipe(editCommentSchema)) body: EditCommentBody,
    ): Promise<BugCommentResponse> {
        const actor = userOf(user);
        const view = await this.editComment.execute({
            bugId: id,
            commentId,
            actorId: actor.id,
            roles: actor.roles,
            body: body.body,
        });
        return new BugCommentResponse(view);
    }
}
