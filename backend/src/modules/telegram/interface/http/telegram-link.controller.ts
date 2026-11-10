import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { zodToOpenApi } from '../../../../shared/http/zod-openapi';
import { CurrentUser, type AuthenticatedUser } from '../../../auth/interface/http/decorators';
import { GetTelegramLinkStatusUseCase } from '../../application/get-telegram-link-status.use-case';
import { IssueLinkTokenUseCase } from '../../application/issue-link-token.use-case';
import { SetTelegramNotificationsUseCase } from '../../application/set-telegram-notifications.use-case';
import { UnlinkAccountUseCase } from '../../application/unlink-account.use-case';
import { LinkTokenThrottlerGuard } from './link-token-throttler.guard';
import { telegramActorOf } from './telegram-actor-of';
import { TelegramLinkStatusResponse, TelegramLinkTokenResponse } from './telegram-link.responses';
import {
    type UpdateTelegramLinkRequest,
    updateTelegramLinkRequestSchema,
} from './telegram-link.schemas';

const errorResponse = (status: HttpStatus, description: string): MethodDecorator =>
    ApiResponse({ status, description, type: ApiErrorResponse });

const unauthorized = errorResponse(HttpStatus.UNAUTHORIZED, 'Missing or invalid access token');
const passwordChangeRequired = errorResponse(
    HttpStatus.FORBIDDEN,
    'PASSWORD_CHANGE_REQUIRED: the temporary password must be changed first',
);

@ApiTags('telegram')
@ApiBearerAuth()
@Controller('telegram')
export class TelegramLinkController {
    constructor(
        private readonly getStatus: GetTelegramLinkStatusUseCase,
        private readonly issueLinkToken: IssueLinkTokenUseCase,
        private readonly setNotifications: SetTelegramNotificationsUseCase,
        private readonly unlinkAccount: UnlinkAccountUseCase,
    ) {}

    @Get('link')
    @ApiOperation({ summary: 'Telegram link of the token user' })
    @ApiResponse({ status: HttpStatus.OK, type: TelegramLinkStatusResponse })
    @unauthorized
    @passwordChangeRequired
    async status(
        @CurrentUser() user: AuthenticatedUser | undefined,
    ): Promise<TelegramLinkStatusResponse> {
        return new TelegramLinkStatusResponse(await this.getStatus.execute(telegramActorOf(user)));
    }

    @Post('link-token')
    @HttpCode(HttpStatus.CREATED)
    @UseGuards(LinkTokenThrottlerGuard)
    @ApiOperation({ summary: 'Issue a one-time t.me link that binds Telegram to the token user' })
    @ApiResponse({ status: HttpStatus.CREATED, type: TelegramLinkTokenResponse })
    @errorResponse(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED: 10 links a minute; see Retry-After')
    @errorResponse(HttpStatus.SERVICE_UNAVAILABLE, 'TELEGRAM_NOT_CONFIGURED: the bot is not set up')
    @unauthorized
    @passwordChangeRequired
    async issue(
        @CurrentUser() user: AuthenticatedUser | undefined,
    ): Promise<TelegramLinkTokenResponse> {
        return new TelegramLinkTokenResponse(
            await this.issueLinkToken.execute(telegramActorOf(user)),
        );
    }

    @Patch('link')
    @ApiOperation({ summary: 'Turn Telegram notifications of the token user on or off' })
    @ApiBody({ schema: zodToOpenApi(updateTelegramLinkRequestSchema) })
    @ApiResponse({ status: HttpStatus.OK, type: TelegramLinkStatusResponse })
    @errorResponse(HttpStatus.BAD_REQUEST, 'Invalid request')
    @errorResponse(HttpStatus.NOT_FOUND, 'TELEGRAM_NOT_LINKED: the token user has no link')
    @unauthorized
    @passwordChangeRequired
    async update(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Body(new ZodValidationPipe(updateTelegramLinkRequestSchema))
        body: UpdateTelegramLinkRequest,
    ): Promise<TelegramLinkStatusResponse> {
        const { userId } = telegramActorOf(user);
        return new TelegramLinkStatusResponse(
            await this.setNotifications.execute(userId, body.notificationsEnabled),
        );
    }

    @Delete('link')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Unlink Telegram from the token user; repeating it is a no-op' })
    @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Unlinked or there was no link' })
    @unauthorized
    @passwordChangeRequired
    async remove(@CurrentUser() user: AuthenticatedUser | undefined): Promise<void> {
        await this.unlinkAccount.execute(telegramActorOf(user).userId);
    }
}
