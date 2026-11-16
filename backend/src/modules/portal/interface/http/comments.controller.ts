import { Body, Controller, Get, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { zodToOpenApi } from '../../../../shared/http/zod-openapi';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '../../../auth/interface/http/decorators';
import { EditCommentUseCase } from '../../application/edit-comment.use-case';
import { ListCommentsUseCase } from '../../application/list-comments.use-case';
import { PostCommentUseCase } from '../../application/post-comment.use-case';
import { CommentListResponse, CommentResponse } from './comments.responses';
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
    'Request not found or not accessible, or comment not found in this request',
);
const forbidden = errorResponse(HttpStatus.FORBIDDEN, 'The comment belongs to another user');
const conflict = errorResponse(HttpStatus.CONFLICT, 'The 15-minute edit window has expired');

// Без @Roles: доступ к заявке проверяет RequestAccessPolicy (автор или разработчик), чужим — 404.
// Идентификаторы не проходят ParseUUIDPipe: невалидный UUID — это «не найдено» (404), как в use case'ах.
@ApiTags('portal')
@ApiBearerAuth()
@Controller('portal/requests/:id/comments')
export class CommentsController {
    constructor(
        private readonly listComments: ListCommentsUseCase,
        private readonly postComment: PostCommentUseCase,
        private readonly editComment: EditCommentUseCase,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Comment feed of a request, oldest first: the author or a developer' })
    @ApiResponse({ status: HttpStatus.OK, type: CommentListResponse })
    @notFound
    @unauthorized
    async list(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id') id: string,
    ): Promise<CommentListResponse> {
        const actor = userOf(user);
        const views = await this.listComments.execute({
            requestId: id,
            actorId: actor.id,
            roles: actor.roles,
        });
        return new CommentListResponse(views);
    }

    @Post()
    @ApiOperation({ summary: 'Add a comment to a request in any status' })
    @ApiBody({ schema: zodToOpenApi(postCommentSchema) })
    @ApiResponse({ status: HttpStatus.CREATED, type: CommentResponse })
    @badRequest
    @notFound
    @unauthorized
    async post(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id') id: string,
        @Body(new ZodValidationPipe(postCommentSchema)) body: PostCommentBody,
    ): Promise<CommentResponse> {
        const actor = userOf(user);
        const view = await this.postComment.execute({
            requestId: id,
            actorId: actor.id,
            roles: actor.roles,
            body: body.body,
        });
        return new CommentResponse(view);
    }

    @Patch(':commentId')
    @ApiOperation({ summary: 'Edit own comment within 15 minutes of posting' })
    @ApiBody({ schema: zodToOpenApi(editCommentSchema) })
    @ApiResponse({ status: HttpStatus.OK, type: CommentResponse })
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
    ): Promise<CommentResponse> {
        const actor = userOf(user);
        const view = await this.editComment.execute({
            requestId: id,
            commentId,
            actorId: actor.id,
            roles: actor.roles,
            body: body.body,
        });
        return new CommentResponse(view);
    }
}
