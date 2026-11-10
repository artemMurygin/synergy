import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { ListActiveUsersUseCase } from '../../application/list-active-users.use-case';
import { UserSearch } from '../../domain/user-search';
import { type ListUsersQuery, listUsersQuerySchema } from './users.schemas';
import { UserListResponse } from './users.responses';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
    constructor(private readonly listActiveUsers: ListActiveUsersUseCase) {}

    @Get()
    @ApiOperation({ summary: 'List active users (id and login) for pickers' })
    @ApiQuery({
        name: 'search',
        required: false,
        description: 'Login substring, case-insensitive, up to 200 characters',
    })
    @ApiQuery({ name: 'limit', required: false, description: 'Page size, 1..100 (default 20)' })
    @ApiQuery({ name: 'page', required: false, description: 'Zero-based page number (default 0)' })
    @ApiResponse({ status: HttpStatus.OK, description: 'A page of users', type: UserListResponse })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid request',
        type: ApiErrorResponse,
    })
    @ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'Missing or invalid access token',
        type: ApiErrorResponse,
    })
    async list(
        @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
    ): Promise<UserListResponse> {
        const result = await this.listActiveUsers.execute(UserSearch.of(query.search), {
            limit: query.limit,
            page: query.page,
        });
        return new UserListResponse(result);
    }
}
