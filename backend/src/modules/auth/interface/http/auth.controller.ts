import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiHeader,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { zodToOpenApi } from '../../../../shared/http/zod-openapi';
import { ChangePasswordUseCase } from '../../application/change-password.use-case';
import { GetCurrentUserUseCase } from '../../application/get-current-user.use-case';
import { LoginThrottler } from '../../application/login-throttler';
import { LoginUseCase } from '../../application/login.use-case';
import { LogoutUseCase } from '../../application/logout.use-case';
import { RefreshSessionUseCase } from '../../application/refresh-session.use-case';
import type { ClientType } from '../../domain/client-type';
import { InvalidRefreshTokenError } from '../../domain/errors';
import type { TokenPair } from '../../domain/token-pair';
import {
    changePasswordRequestSchema,
    currentUserResponseSchema,
    loginRequestSchema,
    refreshTokenBodySchema,
    type TokensResponse,
    tokensResponseSchema,
} from './auth.schemas';
import { resolveClientType } from './client-type';
import {
    AllowPendingPasswordChange,
    type AuthenticatedRequest,
    type AuthenticatedUser,
    CurrentUser,
    Public,
} from './decorators';
import { clientIp, LoginThrottlerGuard, throttleSubject } from './login-throttler.guard';
import { OriginGuard } from './origin.guard';
import { RefreshCookieService } from './refresh-cookie.service';

const clientTypeHeader = ApiHeader({
    name: 'X-Client-Type',
    required: false,
    description: 'desktop: refresh token travels in the body instead of the mh_refresh cookie',
});
const tokensOk = ApiResponse({
    status: HttpStatus.OK,
    description:
        'Access token; the refresh token is in the mh_refresh cookie (or the body for desktop)',
    schema: zodToOpenApi(tokensResponseSchema),
});
const errorResponse = (status: HttpStatus, description: string): MethodDecorator =>
    ApiResponse({ status, description, type: ApiErrorResponse });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly loginUseCase: LoginUseCase,
        private readonly refreshUseCase: RefreshSessionUseCase,
        private readonly logoutUseCase: LogoutUseCase,
        private readonly changePasswordUseCase: ChangePasswordUseCase,
        private readonly currentUserUseCase: GetCurrentUserUseCase,
        private readonly throttler: LoginThrottler,
        private readonly cookies: RefreshCookieService,
    ) {}

    @Post('login')
    @Public()
    @UseGuards(LoginThrottlerGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Sign in with login and password' })
    @ApiBody({ schema: zodToOpenApi(loginRequestSchema) })
    @clientTypeHeader
    @tokensOk
    @errorResponse(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS')
    @errorResponse(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_CLIENT_TYPE')
    @errorResponse(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED; see Retry-After')
    async login(
        @Body(new ZodValidationPipe(loginRequestSchema))
        body: { login: string; password: string },
        @Req() request: AuthenticatedRequest,
        @Res({ passthrough: true }) response: Response,
    ): Promise<TokensResponse> {
        const client = resolveClientType(request);
        const pair = await this.loginUseCase.execute(body.login, body.password);
        await this.throttler.release(throttleSubject(request), clientIp(request));
        return this.respond(client, request, response, pair);
    }

    @Post('refresh')
    @Public()
    @UseGuards(OriginGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
    @clientTypeHeader
    @tokensOk
    @errorResponse(HttpStatus.UNAUTHORIZED, 'TOKEN_INVALID')
    @errorResponse(HttpStatus.FORBIDDEN, 'FORBIDDEN_ORIGIN')
    @errorResponse(HttpStatus.CONFLICT, 'REFRESH_RACE: retry with the cookie the client now holds')
    async refresh(
        @Body(new ZodValidationPipe(refreshTokenBodySchema))
        body: { refreshToken?: string } | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ): Promise<TokensResponse> {
        const client = resolveClientType(request);
        const secret = this.presentedToken(client, request, body);
        if (secret === undefined) throw new InvalidRefreshTokenError();
        const pair = await this.refreshUseCase.execute(secret);
        return this.respond(client, request, response, pair);
    }

    @Post('logout')
    @Public()
    @AllowPendingPasswordChange()
    @UseGuards(OriginGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Revoke the session of the presented refresh token' })
    @clientTypeHeader
    @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Session revoked, cookie cleared' })
    @errorResponse(HttpStatus.FORBIDDEN, 'FORBIDDEN_ORIGIN')
    async logout(
        @Body(new ZodValidationPipe(refreshTokenBodySchema))
        body: { refreshToken?: string } | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ): Promise<void> {
        const client = resolveClientType(request);
        await this.logoutUseCase.execute(this.presentedToken(client, request, body));
        if (client === 'cookie') this.cookies.clear(request, response);
    }

    @Post('change-password')
    @AllowPendingPasswordChange()
    @UseGuards(LoginThrottlerGuard)
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Change the password and issue a new token pair' })
    @ApiBody({ schema: zodToOpenApi(changePasswordRequestSchema) })
    @clientTypeHeader
    @tokensOk
    @errorResponse(HttpStatus.UNAUTHORIZED, 'TOKEN_INVALID or TOKEN_EXPIRED')
    @errorResponse(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'WRONG_PASSWORD, SAME_PASSWORD or WEAK_PASSWORD',
    )
    @errorResponse(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED; see Retry-After')
    async changePassword(
        @Body(new ZodValidationPipe(changePasswordRequestSchema))
        body: { currentPassword: string; newPassword: string },
        @CurrentUser() user: AuthenticatedUser,
        @Req() request: AuthenticatedRequest,
        @Res({ passthrough: true }) response: Response,
    ): Promise<TokensResponse> {
        const client = resolveClientType(request);
        const pair = await this.changePasswordUseCase.execute(
            user.id,
            user.sessionId,
            body.currentPassword,
            body.newPassword,
        );
        await this.throttler.release(throttleSubject(request), clientIp(request));
        return this.respond(client, request, response, pair);
    }

    @Get('me')
    @AllowPendingPasswordChange()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'The signed-in user' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Current user',
        schema: zodToOpenApi(currentUserResponseSchema),
    })
    @errorResponse(HttpStatus.UNAUTHORIZED, 'TOKEN_INVALID or TOKEN_EXPIRED')
    me(@CurrentUser() user: AuthenticatedUser): ReturnType<GetCurrentUserUseCase['execute']> {
        return this.currentUserUseCase.execute(user.id);
    }

    private presentedToken(
        client: ClientType,
        request: Request,
        body: { refreshToken?: string } | undefined,
    ): string | undefined {
        return client === 'desktop' ? body?.refreshToken : this.cookies.read(request);
    }

    private respond(
        client: ClientType,
        request: Request,
        response: Response,
        pair: TokenPair,
    ): TokensResponse {
        const tokens: TokensResponse = {
            accessToken: pair.access,
            expiresIn: pair.expiresIn,
            mustChangePassword: pair.mustChangePassword,
        };
        if (client === 'desktop') return { ...tokens, refreshToken: pair.refresh };
        this.cookies.set(request, response, pair.refresh);
        return tokens;
    }
}
