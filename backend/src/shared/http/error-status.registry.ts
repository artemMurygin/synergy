import type { HttpStatus } from '@nestjs/common';

const statuses = new Map<string, HttpStatus>();

/** Lets a module map its own domain error codes to HTTP statuses without the shared filter knowing the module. */
export function registerErrorStatuses(map: Record<string, HttpStatus>): void {
    for (const [code, status] of Object.entries(map)) statuses.set(code, status);
}

export function findErrorStatus(code: string): HttpStatus | undefined {
    return statuses.get(code);
}
