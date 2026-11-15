import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { zodToOpenApi } from '../../../../shared/http/zod-openapi';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import {
    CurrentUser,
    Roles,
    type AuthenticatedUser,
} from '../../../auth/interface/http/decorators';
import { GetAgentGuideUseCase } from '../../application/get-agent-guide.use-case';
import { SaveAgentGuideUseCase } from '../../application/save-agent-guide.use-case';
import { GuideResponse } from './guides.responses';
import { type SaveGuideBody, saveGuideSchema } from './guides.schemas';
import { userOf } from './user-of';

const errorResponse = (status: HttpStatus, description: string): MethodDecorator =>
    ApiResponse({ status, description, type: ApiErrorResponse });

const unauthorized = errorResponse(HttpStatus.UNAUTHORIZED, 'Missing or invalid access token');
const forbidden = errorResponse(HttpStatus.FORBIDDEN, 'Requires the developer role');
const notFound = errorResponse(HttpStatus.NOT_FOUND, 'Agent not found or archived');
const badRequest = errorResponse(HttpStatus.BAD_REQUEST, 'Invalid guide body');

@ApiTags('portal')
@ApiBearerAuth()
@Controller('portal/agents/:id/guide')
export class GuidesController {
    constructor(
        private readonly getGuide: GetAgentGuideUseCase,
        private readonly saveGuide: SaveAgentGuideUseCase,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Agent guide in Markdown; empty fields if none (any signed-in user)' })
    @ApiResponse({ status: HttpStatus.OK, type: GuideResponse })
    @notFound
    @unauthorized
    async read(@Param('id') id: string): Promise<GuideResponse> {
        return new GuideResponse(await this.getGuide.execute({ agentId: id }));
    }

    @Put()
    @Roles('developer')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Replace the agent guide; a blank body deletes it (developer)',
    })
    @ApiBody({ schema: zodToOpenApi(saveGuideSchema) })
    @ApiResponse({ status: HttpStatus.OK, type: GuideResponse })
    @badRequest
    @forbidden
    @notFound
    @errorResponse(HttpStatus.CONFLICT, 'The agent is archived')
    @unauthorized
    async write(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id') id: string,
        @Body(new ZodValidationPipe(saveGuideSchema)) body: SaveGuideBody,
    ): Promise<GuideResponse> {
        const view = await this.saveGuide.execute({
            agentId: id,
            actorId: userOf(user).id,
            body: body.body,
        });
        return new GuideResponse(view);
    }
}
