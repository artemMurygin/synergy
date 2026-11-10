import { ApiProperty } from '@nestjs/swagger';
import type {
    NotificationDto,
    NotificationPageView,
    UnreadCountView,
} from '../../application/notification-view';
import {
    NOTIFICATION_TARGET_TYPES,
    type NotificationTargetType,
} from '../../domain/notification-target';
import { NOTIFICATION_TYPES, type NotificationType } from '../../domain/notification-type';

const UUID_EXAMPLE = '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231';

export class NotificationTargetResponse {
    @ApiProperty({ enum: NOTIFICATION_TARGET_TYPES })
    readonly type: NotificationTargetType;

    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    constructor(target: NotificationDto['target']) {
        this.type = target.type;
        this.id = target.id;
    }
}

export class NotificationResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty({ enum: NOTIFICATION_TYPES })
    readonly type: NotificationType;

    @ApiProperty({ example: 'Вам назначена задача' })
    readonly title: string;

    @ApiProperty({ example: 'От anna: Подготовить КП' })
    readonly body: string;

    @ApiProperty({ type: NotificationTargetResponse })
    readonly target: NotificationTargetResponse;

    @ApiProperty({ type: String, nullable: true, example: UUID_EXAMPLE })
    readonly actorId: string | null;

    @ApiProperty({ example: '2026-11-06T10:00:00.000Z' })
    readonly createdAt: string;

    @ApiProperty({ type: String, nullable: true, example: null })
    readonly readAt: string | null;

    constructor(dto: NotificationDto) {
        this.id = dto.id;
        this.type = dto.type;
        this.title = dto.title;
        this.body = dto.body;
        this.target = new NotificationTargetResponse(dto.target);
        this.actorId = dto.actorId;
        this.createdAt = dto.createdAt;
        this.readAt = dto.readAt;
    }
}

export class NotificationListResponse {
    @ApiProperty({ type: [NotificationResponse], description: 'Newest first' })
    readonly items: NotificationResponse[];

    @ApiProperty({ description: 'Number of matching notifications, ignoring pagination' })
    readonly total: number;

    @ApiProperty({ example: 20 })
    readonly limit: number;

    @ApiProperty({ example: 0, description: 'Zero-based page number' })
    readonly page: number;

    constructor(view: NotificationPageView) {
        this.items = view.items.map((item) => new NotificationResponse(item));
        this.total = view.total;
        this.limit = view.limit;
        this.page = view.page;
    }
}

export class UnreadCountResponse {
    @ApiProperty({ minimum: 0, example: 3 })
    readonly unreadCount: number;

    constructor(view: UnreadCountView) {
        this.unreadCount = view.unreadCount;
    }
}
