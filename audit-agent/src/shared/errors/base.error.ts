import { RequestContext } from '../context/request-context';

export interface SerializedError {
    message: string;
    code: string;
    correlationId: string;
    stack?: string;
    cause?: string;
    metadata?: unknown;
}

export abstract class BaseError extends Error {
    abstract readonly code: string;

    readonly correlationId: string;

    constructor(
        message: string,
        readonly cause?: Error,
        readonly metadata?: unknown,
    ) {
        super(message);
        this.name = new.target.name;
        this.correlationId = RequestContext.getCorrelationId();
    }

    toJSON(): SerializedError {
        return {
            message: this.message,
            code: this.code,
            stack: this.stack,
            correlationId: this.correlationId,
            cause: JSON.stringify(this.cause),
            metadata: this.metadata,
        };
    }
}
