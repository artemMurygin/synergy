import { HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ApiErrorResponse } from './api-error.response';

export const apiErrorResponse = (status: HttpStatus, description: string): MethodDecorator =>
    ApiResponse({ status, description, type: ApiErrorResponse });

export const apiUnauthorizedResponse = apiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    'Missing or invalid access token',
);
