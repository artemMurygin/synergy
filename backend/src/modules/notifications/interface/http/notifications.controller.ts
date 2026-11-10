import {
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '../../../auth/interface/http/decorators';
import { GetUnreadCountUseCase } from '../../application/get-unread-count.use-case';
import { ListNotificationsUseCase } from '../../application/list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from '../../application/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from '../../application/mark-notification-read.use-case';
import { notificationActorOf } from './notification-actor-of';
import { NotificationListResponse, UnreadCountResponse } from './notifications.responses';
import {
    type ListNotificationsQueryRequest,
    listNotificationsQuerySchema,
} from './notifications.schemas';

const errorResponse = (status: HttpStatus, description: string): MethodDecorator =>
    ApiResponse({ status, description, type: ApiErrorResponse });

const unauthorized = errorResponse(HttpStatus.UNAUTHORIZED, 'Missing or invalid access token');
const passwordChangeRequired = errorResponse(
    HttpStatus.FORBIDDEN,
    'PASSWORD_CHANGE_REQUIRED: the temporary password must be changed first',
);
const badRequest = errorResponse(HttpStatus.BAD_REQUEST, 'Invalid request');
const notFound = errorResponse(
    HttpStatus.NOT_FOUND,
    'NOTIFICATION_NOT_FOUND: no such notification for the token user',
);

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
    constructor(
        private readonly listNotifications: ListNotificationsUseCase,
        private readonly getUnreadCount: GetUnreadCountUseCase,
        private readonly markNotificationRead: MarkNotificationReadUseCase,
        private readonly markAllNotificationsRead: MarkAllNotificationsReadUseCase,
    ) {}

    @Get()
    @ApiOperation({ summary: 'List notifications of the token user, newest first' })
    @ApiQuery({ name: 'limit', required: false, description: 'Page size, 1..100 (default 20)' })
    @ApiQuery({ name: 'page', required: false, description: 'Zero-based page number (default 0)' })
    @ApiQuery({
        name: 'unreadOnly',
        required: false,
        enum: ['true', 'false'],
        description: 'true: only notifications that are not read yet',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'A page of notifications',
        type: NotificationListResponse,
    })
    @badRequest
    @unauthorized
    @passwordChangeRequired
    async list(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Query(new ZodValidationPipe(listNotificationsQuerySchema))
        query: ListNotificationsQueryRequest,
    ): Promise<NotificationListResponse> {
        const page = await this.listNotifications.execute(notificationActorOf(user), {
            limit: query.limit,
            page: query.page,
            unreadOnly: query.unreadOnly,
        });
        return new NotificationListResponse(page);
    }

    @Get('unread-count')
    @ApiOperation({ summary: 'Number of unread notifications of the token user' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Unread count', type: UnreadCountResponse })
    @unauthorized
    @passwordChangeRequired
    async unreadCount(
        @CurrentUser() user: AuthenticatedUser | undefined,
    ): Promise<UnreadCountResponse> {
        return new UnreadCountResponse(
            await this.getUnreadCount.execute(notificationActorOf(user)),
        );
    }

    @Post('read-all')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Mark every notification of the token user read' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Unread count after the change, always 0',
        type: UnreadCountResponse,
    })
    @unauthorized
    @passwordChangeRequired
    async readAll(
        @CurrentUser() user: AuthenticatedUser | undefined,
    ): Promise<UnreadCountResponse> {
        return new UnreadCountResponse(
            await this.markAllNotificationsRead.execute(notificationActorOf(user)),
        );
    }

    @Post(':id/read')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Mark a notification read; repeating it keeps the first read time',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Unread count after the change',
        type: UnreadCountResponse,
    })
    @badRequest
    @notFound
    @unauthorized
    @passwordChangeRequired
    async read(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<UnreadCountResponse> {
        return new UnreadCountResponse(
            await this.markNotificationRead.execute(notificationActorOf(user), id),
        );
    }
}
