import {
    applyDecorators,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOperation,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { zodToOpenApi } from '../../../../shared/http/zod-openapi';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '../../../auth/interface/http/decorators';
import { CreateTaskUseCase } from '../../application/create-task.use-case';
import { DeleteTaskUseCase } from '../../application/delete-task.use-case';
import { GetTaskUseCase } from '../../application/get-task.use-case';
import { ListTasksUseCase } from '../../application/list-tasks.use-case';
import { UpdateTaskUseCase, type TaskPatch } from '../../application/update-task.use-case';
import { TaskFilter } from '../../domain/task-filter';
import { TaskSort } from '../../domain/task-sort';
import { actorOf } from './actor-of';
import {
    type CreateTaskRequest,
    createTaskRequestSchema,
    type ListTasksQuery,
    listTasksQuerySchema,
    type UpdateTaskRequest,
    updateTaskRequestSchema,
} from './tasks.schemas';
import { TaskDetailsResponse, TaskListResponse, TaskResponse } from './tasks.responses';

const errorResponse = (status: HttpStatus, description: string): MethodDecorator =>
    ApiResponse({ status, description, type: ApiErrorResponse });

const unauthorized = errorResponse(HttpStatus.UNAUTHORIZED, 'Missing or invalid access token');
const notFound = errorResponse(HttpStatus.NOT_FOUND, 'Task not found or deleted');
const userNotFound = errorResponse(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'TASK_USER_NOT_FOUND: assignee or watcher does not exist or is inactive',
);
const badRequest = errorResponse(HttpStatus.BAD_REQUEST, 'Invalid request');

const QUERY_DOCS: { name: keyof ListTasksQuery; description: string }[] = [
    { name: 'status', description: 'todo | in_progress | done' },
    { name: 'creatorId', description: 'Only tasks created by this user' },
    { name: 'assigneeId', description: 'Only tasks assigned to this user' },
    { name: 'watcherId', description: 'Only tasks watched by this user' },
    { name: 'overdue', description: 'true: deadline passed and not done; false: the rest' },
    { name: 'search', description: 'Substring of the title, case-insensitive' },
    { name: 'sort', description: 'deadline | createdAt | updatedAt (default createdAt)' },
    { name: 'order', description: 'asc | desc (default desc)' },
    { name: 'limit', description: 'Page size, 1..100 (default 20)' },
    { name: 'page', description: 'Zero-based page number (default 0)' },
];
const queryDocs = applyDecorators(
    ...QUERY_DOCS.map(({ name, description }) => ApiQuery({ name, description, required: false })),
);

function toDeadline(value: string | null | undefined): Date | null | undefined {
    return typeof value === 'string' ? new Date(value) : value;
}

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
    constructor(
        private readonly createTask: CreateTaskUseCase,
        private readonly getTask: GetTaskUseCase,
        private readonly listTasks: ListTasksUseCase,
        private readonly updateTask: UpdateTaskUseCase,
        private readonly deleteTask: DeleteTaskUseCase,
    ) {}

    @Post()
    @ApiOperation({ summary: 'Create a task; the creator is the token user' })
    @ApiBody({ schema: zodToOpenApi(createTaskRequestSchema) })
    @ApiResponse({ status: HttpStatus.CREATED, description: 'Created task', type: TaskResponse })
    @badRequest
    @userNotFound
    @unauthorized
    async create(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Body(new ZodValidationPipe(createTaskRequestSchema)) body: CreateTaskRequest,
    ): Promise<TaskResponse> {
        const view = await this.createTask.execute(actorOf(user), {
            title: body.title,
            description: body.description,
            deadline: toDeadline(body.deadline),
            assigneeId: body.assigneeId,
            watcherIds: body.watcherIds,
        });
        return new TaskResponse(view);
    }

    @Get()
    @ApiOperation({ summary: 'List tasks with filters, sorting and pagination' })
    @queryDocs
    @ApiResponse({ status: HttpStatus.OK, description: 'A page of tasks', type: TaskListResponse })
    @badRequest
    @unauthorized
    async list(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery,
    ): Promise<TaskListResponse> {
        const result = await this.listTasks.execute(
            actorOf(user),
            TaskFilter.of({
                status: query.status,
                creatorId: query.creatorId,
                assigneeId: query.assigneeId,
                watcherId: query.watcherId,
                overdue: query.overdue === undefined ? undefined : query.overdue === 'true',
                titleContains: query.search,
            }),
            TaskSort.of({ field: query.sort, direction: query.order }),
            { limit: query.limit, page: query.page },
        );
        return new TaskListResponse(result);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a task' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'The task with attachment metadata',
        type: TaskDetailsResponse,
    })
    @badRequest
    @notFound
    @unauthorized
    async get(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<TaskDetailsResponse> {
        return new TaskDetailsResponse(await this.getTask.execute(actorOf(user), id));
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Partially update a task; null clears deadline and assignee' })
    @ApiBody({ schema: zodToOpenApi(updateTaskRequestSchema) })
    @ApiResponse({ status: HttpStatus.OK, description: 'Updated task', type: TaskResponse })
    @badRequest
    @notFound
    @userNotFound
    @unauthorized
    async update(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(updateTaskRequestSchema)) body: UpdateTaskRequest,
    ): Promise<TaskResponse> {
        const patch: TaskPatch = {
            title: body.title,
            description: body.description,
            status: body.status,
            deadline: toDeadline(body.deadline),
            assigneeId: body.assigneeId,
            watcherIds: body.watcherIds,
        };
        return new TaskResponse(await this.updateTask.execute(actorOf(user), id, patch));
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Soft-delete a task' })
    @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Task deleted' })
    @badRequest
    @notFound
    @unauthorized
    async remove(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<void> {
        await this.deleteTask.execute(actorOf(user), id);
    }
}
