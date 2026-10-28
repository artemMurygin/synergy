import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';
const MAX_ID_LENGTH = 128;

export interface RequestIds {
    requestId: string;
    correlationId: string;
}

function readIncomingId(req: IncomingMessage, header: string): string | undefined {
    const value = req.headers[header];
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
        ? value
        : undefined;
}

export function resolveRequestIds(req: IncomingMessage, res: ServerResponse): RequestIds {
    const assignedRequestId = res.getHeader(REQUEST_ID_HEADER);
    const assignedCorrelationId = res.getHeader(CORRELATION_ID_HEADER);
    if (typeof assignedRequestId === 'string' && typeof assignedCorrelationId === 'string') {
        return { requestId: assignedRequestId, correlationId: assignedCorrelationId };
    }
    const requestId = randomUUID();
    const correlationId =
        readIncomingId(req, CORRELATION_ID_HEADER) ??
        readIncomingId(req, REQUEST_ID_HEADER) ??
        requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    return { requestId, correlationId };
}
