import { ApiProperty } from '@nestjs/swagger';
import type { UserListResult } from '../../application/list-active-users.use-case';
import type { UserSummary } from '../../domain/user-summary';

export class UserSummaryResponse {
    @ApiProperty({ example: '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231' })
    readonly id: string;

    @ApiProperty({ example: 'anna' })
    readonly login: string;

    constructor(user: UserSummary) {
        this.id = user.id;
        this.login = user.login;
    }
}

export class UserListResponse {
    @ApiProperty({ type: [UserSummaryResponse] })
    readonly items: UserSummaryResponse[];

    @ApiProperty({ description: 'Number of active users matching the search, ignoring pagination' })
    readonly total: number;

    @ApiProperty({ example: 20 })
    readonly limit: number;

    @ApiProperty({ example: 0, description: 'Zero-based page number' })
    readonly page: number;

    constructor(result: UserListResult) {
        this.items = result.items.map((item) => new UserSummaryResponse(item));
        this.total = result.total;
        this.limit = result.limit;
        this.page = result.page;
    }
}
