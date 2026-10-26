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

const INTERNAL_ERROR_MESSAGE = 'Internal server error';

function resolveStatus(error: BaseError): HttpStatus {
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
        this.httpAdapterHost.httpAdapter.reply(
            host.switchToHttp().getResponse<unknown>(),
            body,
            body.statusCode,
        );
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
