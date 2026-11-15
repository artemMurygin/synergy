import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Put,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { CreateEmployeeUseCase } from '../../application/create-employee.use-case';
import { DismissEmployeeUseCase } from '../../application/dismiss-employee.use-case';
import { GetEmployeeUseCase } from '../../application/get-employee.use-case';
import { ListEmployeesUseCase } from '../../application/list-employees.use-case';
import { ReplaceEmployeeRolesUseCase } from '../../application/replace-employee-roles.use-case';
import { RestoreEmployeeUseCase } from '../../application/restore-employee.use-case';
import { UpdateEmployeeProfileUseCase } from '../../application/update-employee-profile.use-case';
import {
    type CreateEmployeeBody,
    createEmployeeBodySchema,
    type EmployeeResponse,
    type ListEmployeesQuery,
    listEmployeesQuerySchema,
    type ReplaceRolesBody,
    replaceRolesBodySchema,
    toEmployeeResponse,
    type UpdateEmployeeBody,
    updateEmployeeBodySchema,
} from './admin.schemas';
import { Roles } from './decorators';

@ApiTags('admin-employees')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/employees')
export class AdminEmployeesController {
    constructor(
        private readonly listEmployees: ListEmployeesUseCase,
        private readonly getEmployee: GetEmployeeUseCase,
        private readonly createEmployee: CreateEmployeeUseCase,
        private readonly updateProfile: UpdateEmployeeProfileUseCase,
        private readonly replaceRoles: ReplaceEmployeeRolesUseCase,
        private readonly dismissEmployee: DismissEmployeeUseCase,
        private readonly restoreEmployee: RestoreEmployeeUseCase,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Employees: search, department and dismissal filters, paging' })
    async list(
        @Query(new ZodValidationPipe(listEmployeesQuerySchema)) query: ListEmployeesQuery,
    ): Promise<{ items: EmployeeResponse[]; total: number; limit: number; page: number }> {
        // The API pages from zero like the other lists; the directory query counts from one.
        const result = await this.listEmployees.execute({
            ...(query.search === undefined || query.search === '' ? {} : { search: query.search }),
            ...(query.departmentId === undefined ? {} : { departmentId: query.departmentId }),
            ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
            limit: query.limit,
            page: query.page + 1,
        });
        return {
            items: result.items.map(toEmployeeResponse),
            total: result.total,
            limit: result.limit,
            page: result.page - 1,
        };
    }

    @Get(':id')
    @ApiOperation({ summary: 'Employee card' })
    async get(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeResponse> {
        return toEmployeeResponse(await this.getEmployee.execute(id));
    }

    @Post()
    @ApiOperation({ summary: 'Create an employee; the temporary password is returned once' })
    async create(
        @Body(new ZodValidationPipe(createEmployeeBodySchema)) body: CreateEmployeeBody,
    ): Promise<{ employee: EmployeeResponse; temporaryPassword: string }> {
        const { employee, temporaryPassword } = await this.createEmployee.execute(body);
        return { employee: toEmployeeResponse(employee), temporaryPassword };
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Edit the profile: omitted stays, empty clears, login is immutable' })
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(updateEmployeeBodySchema)) body: UpdateEmployeeBody,
    ): Promise<EmployeeResponse> {
        return toEmployeeResponse(await this.updateProfile.execute(id, body));
    }

    @Put(':id/roles')
    @ApiOperation({ summary: 'Replace the whole role set' })
    async roles(
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(replaceRolesBodySchema)) body: ReplaceRolesBody,
    ): Promise<EmployeeResponse> {
        return toEmployeeResponse(await this.replaceRoles.execute(id, body.roles));
    }

    @Post(':id/dismiss')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Dismiss: deactivates and revokes every refresh session; idempotent' })
    async dismiss(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeResponse> {
        return toEmployeeResponse(await this.dismissEmployee.execute(id));
    }

    @Post(':id/restore')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Return a dismissed employee; idempotent' })
    async restore(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeResponse> {
        return toEmployeeResponse(await this.restoreEmployee.execute(id));
    }
}
