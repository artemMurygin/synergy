import { ApiProperty } from '@nestjs/swagger';
import type { BugCommentView } from '../../application/bug-comment-view';
import type { BugCommentAuthorRole } from '../../domain/ports/bug-comment-query.port';

const UUID_EXAMPLE = '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231';

class BugCommentAuthorResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id!: string;

    @ApiProperty({ example: 'anna' })
    readonly login!: string;

    @ApiProperty({ example: 'Иванова Анна', description: 'ФИО; если не заполнено, логин' })
    readonly fullName!: string;
}

export class BugCommentResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty()
    readonly body: string;

    @ApiProperty({ type: BugCommentAuthorResponse })
    readonly author: BugCommentAuthorResponse;

    @ApiProperty({ enum: ['bug_author', 'developer'] })
    readonly authorRole: BugCommentAuthorRole;

    @ApiProperty({ example: '2026-11-06T10:00:00.000Z' })
    readonly createdAt: string;

    @ApiProperty({ type: String, nullable: true, example: '2026-11-06T10:05:00.000Z' })
    readonly editedAt: string | null;

    @ApiProperty({ description: 'Автор вызова может править комментарий (окно 15 минут)' })
    readonly canEdit: boolean;

    constructor(view: BugCommentView) {
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

export class BugCommentListResponse {
    @ApiProperty({ type: [BugCommentResponse], description: 'Старые сверху: created_at, id' })
    readonly items: BugCommentResponse[];

    constructor(views: BugCommentView[]) {
        this.items = views.map((view) => new BugCommentResponse(view));
    }
}
