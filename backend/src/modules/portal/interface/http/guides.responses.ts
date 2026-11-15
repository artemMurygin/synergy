import { ApiProperty } from '@nestjs/swagger';
import type { GuideView } from '../../application/guide-view';

class GuideAuthorResponse {
    @ApiProperty({ example: '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231' })
    readonly id!: string;

    @ApiProperty({ example: 'dev' })
    readonly login!: string;

    @ApiProperty({ example: 'Иван Разработчик' })
    readonly fullName!: string;
}

export class GuideResponse {
    @ApiProperty({ type: String, nullable: true, description: 'Markdown; null — инструкции нет' })
    readonly body: string | null;

    @ApiProperty({ type: String, nullable: true, example: '2026-11-10T09:00:00.000Z' })
    readonly updatedAt: string | null;

    @ApiProperty({ type: GuideAuthorResponse, nullable: true })
    readonly updatedBy: GuideAuthorResponse | null;

    constructor(view: GuideView) {
        this.body = view.body;
        this.updatedAt = view.updatedAt === null ? null : view.updatedAt.toISOString();
        this.updatedBy =
            view.updatedBy === null
                ? null
                : {
                      id: view.updatedBy.id,
                      login: view.updatedBy.login,
                      fullName: view.updatedBy.fullName,
                  };
    }
}
