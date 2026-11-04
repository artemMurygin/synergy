export const PROGRAMS_SYNC_ERROR_CODES = [
    'GROUP_NOT_FOUND',
    'GROUP_NOT_RUNNABLE',
    'GROUP_NOT_AVAILABLE',
    'INVALID_QUERY',
    'SOURCE_NOT_IN_GROUP',
    'INVALID_RANGE',
    'SOURCE_UNAVAILABLE',
    'RATE_LIMITED',
    'TIMEOUT',
    'CATALOG_UNAVAILABLE',
    'RECORD_NOT_FOUND',
    'AGENT_TIMEOUT',
    'AGENT_PROVIDER_ERROR',
    'MUTATION_CONFLICT',
    'INVALID_WORKFLOW_DATA',
] as const;

export type ProgramsSyncErrorCode = (typeof PROGRAMS_SYNC_ERROR_CODES)[number];

const RETRYABLE_CODES: ReadonlySet<ProgramsSyncErrorCode> = new Set([
    'SOURCE_UNAVAILABLE',
    'RATE_LIMITED',
    'TIMEOUT',
    'CATALOG_UNAVAILABLE',
    'AGENT_TIMEOUT',
    'AGENT_PROVIDER_ERROR',
]);

export function isRetryableCode(code: ProgramsSyncErrorCode): boolean {
    return RETRYABLE_CODES.has(code);
}

/** Brief technical failure reason: no sheet content and no prompt. */
export interface RunFailure {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
}

export class ProgramsSyncError extends Error {
    readonly retryable: boolean;

    constructor(
        readonly code: ProgramsSyncErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'ProgramsSyncError';
        this.retryable = isRetryableCode(code);
    }

    toFailure(): RunFailure {
        return { code: this.code, message: this.message, retryable: this.retryable };
    }
}
