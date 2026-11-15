import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { CreateDepartmentUseCase } from '../../application/create-department.use-case';
import { DeleteDepartmentUseCase } from '../../application/delete-department.use-case';
import { ListDepartmentsUseCase } from '../../application/list-departments.use-case';
import { UpdateDepartmentUseCase } from '../../application/update-department.use-case';
import {
    type CreateDepartmentBody,
    createDepartmentBodySchema,
    type DepartmentResponse,
    departmentIdSchema,
    toDepartmentResponse,
    type UpdateDepartmentBody,
    updateDepartmentBodySchema,
} from './admin.schemas';
import { Roles } from './decorators';

@ApiTags('admin-departments')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/departments')
export class AdminDepartmentsController {
    constructor(
        private readonly listDepartments: ListDepartmentsUseCase,
        private readonly createDepartment: CreateDepartmentUseCase,
        private readonly updateDepartment: UpdateDepartmentUseCase,
        private readonly deleteDepartment: DeleteDepartmentUseCase,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Departments by name with head and employee count' })
    async list(): Promise<DepartmentResponse[]> {
        return (await this.listDepartments.execute()).map(toDepartmentResponse);
    }

    @Post()
    @ApiOperation({ summary: 'Create a department' })
    async create(
        @Body(new ZodValidationPipe(createDepartmentBodySchema)) body: CreateDepartmentBody,
    ): Promise<DepartmentResponse> {
        const department = await this.createDepartment.execute({
            name: body.name,
            ...(body.headUserId === null || body.headUserId === undefined
                ? {}
                : { headUserId: body.headUserId }),
        });
        return toDepartmentResponse(department);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Rename and/or change the head (null clears it)' })
    async update(
        @Param('id', new ZodValidationPipe(departmentIdSchema)) id: string,
        @Body(new ZodValidationPipe(updateDepartmentBodySchema)) body: UpdateDepartmentBody,
    ): Promise<DepartmentResponse> {
        return toDepartmentResponse(await this.updateDepartment.execute(id, body));
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete an empty department' })
    async remove(
        @Param('id', new ZodValidationPipe(departmentIdSchema)) id: string,
    ): Promise<void> {
        await this.deleteDepartment.execute(id);
    }
}
