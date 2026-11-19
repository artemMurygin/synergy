import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AttachmentDownloadLink } from '../../application/create-attachment-download-link.use-case';
import type { AttachmentView } from '../../application/attachment-view';
import type { TaskListResult } from '../../application/list-tasks.use-case';
import type { TaskDetailsView, TaskUserRef, TaskView } from '../../application/task-view';
import { TASK_STATUSES, type TaskStatus } from '../../domain/task-status';

const UUID_EXAMPLE = '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231';

export class TaskUserResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty({
        type: String,
        nullable: true,
        example: 'anna',
        description: 'null when the user has been deactivated',
    })
    readonly login: string | null;

    constructor(user: TaskUserRef) {
        this.id = user.id;
        this.login = user.login;
    }
}

export class TaskResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty({ example: 'Подготовить КП' })
    readonly title: string;

    @ApiProperty()
    readonly description: string;

    @ApiProperty({ enum: TASK_STATUSES })
    readonly status: TaskStatus;

    @ApiProperty({ type: String, nullable: true, example: '2026-12-01T09:00:00.000Z' })
    readonly deadline: string | null;

    @ApiProperty({ type: TaskUserResponse, description: 'Постановщик задачи' })
    readonly creator: TaskUserResponse;

    @ApiProperty({
        type: TaskUserResponse,
        description: 'Кто фактически создал задачу; у старых задач равен создателю',
    })
    readonly initiator: TaskUserResponse;

    @ApiProperty({ type: TaskUserResponse, nullable: true })
    readonly assignee: TaskUserResponse | null;

    @ApiProperty({ type: [TaskUserResponse] })
    readonly watchers: TaskUserResponse[];

    @ApiProperty({ example: '2026-11-06T10:00:00.000Z' })
    readonly createdAt: string;

    @ApiProperty({ example: '2026-11-06T10:05:00.000Z' })
    readonly updatedAt: string;

    @ApiProperty({ type: String, nullable: true, example: '2026-11-07T10:00:00.000Z' })
    readonly completedAt: string | null;

    @ApiProperty({ type: Number, minimum: 0, example: 2, description: 'Number of attachments' })
    readonly attachmentCount: number;

    constructor(view: TaskView) {
        this.id = view.id;
        this.title = view.title;
        this.description = view.description;
        this.status = view.status;
        this.deadline = view.deadline?.toISOString() ?? null;
        this.creator = new TaskUserResponse(view.creator);
        this.initiator = new TaskUserResponse(view.initiator);
        this.assignee = view.assignee === null ? null : new TaskUserResponse(view.assignee);
        this.watchers = view.watchers.map((watcher) => new TaskUserResponse(watcher));
        this.createdAt = view.createdAt.toISOString();
        this.updatedAt = view.updatedAt.toISOString();
        this.completedAt = view.completedAt?.toISOString() ?? null;
        this.attachmentCount = view.attachmentCount;
    }
}

export class TaskDetailsResponse extends TaskResponse {
    @ApiProperty({ type: () => [AttachmentResponse] })
    readonly attachments: AttachmentResponse[];

    constructor(view: TaskDetailsView) {
        super(view);
        this.attachments = view.attachments.map((attachment) => new AttachmentResponse(attachment));
    }
}

export class TaskListResponse {
    @ApiProperty({ type: [TaskResponse] })
    readonly items: TaskResponse[];

    @ApiProperty({ description: 'Number of tasks matching the filters, ignoring pagination' })
    readonly total: number;

    @ApiProperty({ example: 20 })
    readonly limit: number;

    @ApiProperty({ example: 0, description: 'Zero-based page number' })
    readonly page: number;

    constructor(result: TaskListResult) {
        this.items = result.items.map((item) => new TaskResponse(item));
        this.total = result.total;
        this.limit = result.limit;
        this.page = result.page;
    }
}

export class AttachmentResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty({ example: UUID_EXAMPLE })
    readonly taskId: string;

    @ApiProperty({ example: 'Прайс 2026.pdf' })
    readonly originalName: string;

    @ApiProperty({ example: 52311 })
    readonly sizeBytes: number;

    @ApiProperty({ example: 'application/pdf' })
    readonly contentType: string;

    @ApiProperty({ example: UUID_EXAMPLE })
    readonly uploadedBy: string;

    @ApiProperty({ example: '2026-11-06T10:00:00.000Z' })
    readonly createdAt: string;

    constructor(view: AttachmentView) {
        this.id = view.id;
        this.taskId = view.taskId;
        this.originalName = view.originalName;
        this.sizeBytes = view.sizeBytes;
        this.contentType = view.contentType;
        this.uploadedBy = view.uploadedBy;
        this.createdAt = view.createdAt.toISOString();
    }
}

export class AttachmentUploadBody {
    @ApiPropertyOptional({ type: 'string', format: 'binary', description: 'The file to attach' })
    readonly file?: unknown;
}

export class AttachmentDownloadLinkResponse {
    @ApiProperty({
        example: `/tasks/${UUID_EXAMPLE}/attachments/${UUID_EXAMPLE}/content?token=eyJhbGciOiJIUzI1NiJ9...`,
        description: 'Relative URL that works without the Authorization header',
    })
    readonly url: string;

    @ApiProperty({ example: '2026-11-06T10:05:00.000Z' })
    readonly expiresAt: string;

    constructor(link: AttachmentDownloadLink) {
        this.url = link.url;
        this.expiresAt = link.expiresAt.toISOString();
    }
}
