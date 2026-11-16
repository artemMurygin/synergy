import { ApiProperty } from '@nestjs/swagger';
import type { CommentView } from '../../application/comment-view';
import type { CommentAuthorRole } from '../../domain/ports/comment-query.port';

const UUID_EXAMPLE = '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231';

class CommentAuthorResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id!: string;

    @ApiProperty({ example: 'anna' })
    readonly login!: string;

    @ApiProperty({ example: 'Иванова Анна', description: 'ФИО; если не заполнено, логин' })
    readonly fullName!: string;
}

export class CommentResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty()
    readonly body: string;

    @ApiProperty({ type: CommentAuthorResponse })
    readonly author: CommentAuthorResponse;

    @ApiProperty({ enum: ['request_author', 'developer'] })
    readonly authorRole: CommentAuthorRole;

    @ApiProperty({ example: '2026-11-06T10:00:00.000Z' })
    readonly createdAt: string;

    @ApiProperty({ type: String, nullable: true, example: '2026-11-06T10:05:00.000Z' })
    readonly editedAt: string | null;

    @ApiProperty({ description: 'Автор вызова может править комментарий (окно 15 минут)' })
    readonly canEdit: boolean;

    constructor(view: CommentView) {
        this.id = view.id;
        this.body = view.body;
        this.author = {
            id: view.author.id,
            login: view.author.login,
            fullName: view.author.fullName,
        };
        this.authorRole = view.authorRole;
        this.createdAt = view.createdAt.toISOString();
        this.editedAt = view.editedAt === null ? null : view.editedAt.toISOString();
        this.canEdit = view.canEdit;
    }
}

export class CommentListResponse {
    @ApiProperty({ type: [CommentResponse], description: 'Старые сверху: created_at, id' })
    readonly items: CommentResponse[];

    constructor(views: CommentView[]) {
        this.items = views.map((view) => new CommentResponse(view));
    }
}
