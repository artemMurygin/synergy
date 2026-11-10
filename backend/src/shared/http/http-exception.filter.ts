import {
    type ArgumentsHost,
    Catch,
    type ExceptionFilter,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../context/request-context';
import {
    ArgumentInvalidError,
    ArgumentNotProvidedError,
    ArgumentOutOfRangeError,
    BaseError,
    ConflictError,
    NotFoundError,
} from '../errors';
import { ApiErrorResponse } from './api-error.response';
import { findErrorStatus } from './error-status.registry';

const INTERNAL_ERROR_MESSAGE = 'Internal server error';

function resolveStatus(error: BaseError): HttpStatus {
    const registered = findErrorStatus(error.code);
    if (registered !== undefined) {
        return registered;
    }
    if (
        error instanceof ArgumentInvalidError ||
        error instanceof ArgumentNotProvidedError ||
        error instanceof ArgumentOutOfRangeError
    ) {
        return HttpStatus.BAD_REQUEST;
    }
    if (error instanceof NotFoundError) {
        return HttpStatus.NOT_FOUND;
    }
    if (error instanceof ConflictError) {
        return HttpStatus.CONFLICT;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
}

function resolveHttpExceptionMessage(exception: HttpException): string {
    const body = exception.getResponse();
    if (typeof body === 'string') {
        return body;
    }
    if ('message' in body && typeof body.message === 'string') {
        return body.message;
    }
    return exception.message;
}

type ErrorExtras = Pick<ApiErrorResponse, 'violations' | 'retryAfterSeconds'>;

function readExtras(source: unknown): ErrorExtras {
    if (typeof source !== 'object' || source === null) {
        return {};
    }
    const { violations, retryAfterSeconds } = source as Record<string, unknown>;
    return {
        ...(Array.isArray(violations) && violations.every((v) => typeof v === 'string')
            ? { violations: violations }
            : {}),
        ...(typeof retryAfterSeconds === 'number' ? { retryAfterSeconds } : {}),
    };
}

function readHttpExceptionCode(exception: HttpException): string | undefined {
    const body = exception.getResponse();
    return typeof body === 'object' && 'code' in body && typeof body.code === 'string'
        ? body.code
        : undefined;
}

interface ClientHttpError extends Error {
    status: number;
    type?: string;
}

/** 4xx errors of Express middleware (body-parser: too large, malformed JSON) are not HttpException. */
function asClientHttpError(exception: unknown): ClientHttpError | undefined {
    if (!(exception instanceof Error)) return undefined;
    const { status, expose } = exception as { status?: unknown; expose?: unknown };
    return typeof status === 'number' && status >= 400 && status < 500 && expose === true
        ? (exception as ClientHttpError)
        : undefined;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    constructor(
        private readonly httpAdapterHost: HttpAdapterHost,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(HttpExceptionFilter.name);
    }

    catch(exception: unknown, host: ArgumentsHost): void {
        const body = this.buildBody(exception);
        const { httpAdapter } = this.httpAdapterHost;
        const response = host.switchToHttp().getResponse<unknown>();
        if (body.retryAfterSeconds !== undefined) {
            httpAdapter.setHeader(response, 'Retry-After', String(body.retryAfterSeconds));
        }
        httpAdapter.reply(response, body, body.statusCode);
    }

    private buildBody(exception: unknown): ApiErrorResponse {
        const correlationId = RequestContext.getCorrelationId();
        const requestId = RequestContext.getRequestId();

        if (exception instanceof BaseError) {
            const statusCode = resolveStatus(exception);
            this.logException(statusCode, exception);
            return new ApiErrorResponse({
                statusCode,
                message:
                    statusCode === HttpStatus.INTERNAL_SERVER_ERROR
                        ? INTERNAL_ERROR_MESSAGE
                        : exception.message,
                error: exception.code,
                code: exception.code,
                ...readExtras(exception),
                correlationId,
                requestId,
            });
        }

        if (exception instanceof HttpException) {
            const statusCode = exception.getStatus();
            this.logException(statusCode, exception);
            return new ApiErrorResponse({
                statusCode,
                message: resolveHttpExceptionMessage(exception),
                error: exception.name,
                ...(readHttpExceptionCode(exception) !== undefined
                    ? { code: readHttpExceptionCode(exception) }
                    : {}),
                ...readExtras(exception.getResponse()),
                correlationId,
                requestId,
            });
        }

        const clientError = asClientHttpError(exception);
        if (clientError !== undefined) {
            this.logException(clientError.status, clientError);
            return new ApiErrorResponse({
                statusCode: clientError.status,
                message: clientError.message,
                error: clientError.name,
                ...(clientError.type !== undefined ? { code: clientError.type } : {}),
                correlationId,
                requestId,
            });
        }

        this.logger.error({ err: exception }, 'Unhandled exception');
        return new ApiErrorResponse({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: INTERNAL_ERROR_MESSAGE,
            error: 'InternalServerError',
            correlationId,
            requestId,
        });
    }

    private logException(statusCode: number, exception: Error): void {
        if (statusCode >= 500) {
            this.logger.error({ statusCode, err: exception }, 'Request failed');
            return;
        }
        this.logger.debug({ statusCode, err: exception }, 'Request rejected');
    }
}
