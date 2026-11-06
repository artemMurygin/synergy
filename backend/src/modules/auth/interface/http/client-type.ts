import { UnprocessableEntityException } from '@nestjs/common';
import type { Request } from 'express';
import { ClientType, InvalidClientTypeError } from '../../domain/client-type';
import { AuthErrorCode } from '../../domain/errors';

export function resolveClientType(request: Request): ClientType {
    try {
        return ClientType.parse(request.header('x-client-type'));
    } catch (error) {
        if (error instanceof InvalidClientTypeError) {
            throw new UnprocessableEntityException({
                code: AuthErrorCode.InvalidClientType,
                message: error.message,
            });
        }
        throw error;
    }
}
