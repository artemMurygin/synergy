import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface BotApiStubRequest {
    readonly token: string;
    readonly method: string;
    readonly body: unknown;
}

export interface BotApiStubReply {
    readonly status: number;
    readonly body: unknown;
    readonly delayMs?: number;
}

export type BotApiStubResponder = (request: BotApiStubRequest) => BotApiStubReply;

const PATH_PATTERN = /^\/bot([^/]+)\/([A-Za-z]+)$/;
const DEFAULT_REPLY: BotApiStubReply = { status: 200, body: { ok: true, result: true } };

function readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf8'));
        });
        request.on('error', reject);
    });
}

function parseJson(text: string): unknown {
    if (text === '') return null;
    try {
        const parsed: unknown = JSON.parse(text);
        return parsed;
    } catch {
        return text;
    }
}

export class BotApiStub {
    readonly requests: BotApiStubRequest[] = [];

    private readonly responders = new Map<string, BotApiStubResponder>();

    private readonly pendingTimers = new Set<NodeJS.Timeout>();

    private constructor(
        private readonly server: Server,
        readonly baseUrl: string,
    ) {}

    static async start(): Promise<BotApiStub> {
        const server = createServer();
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (address === null || typeof address === 'string') {
            throw new Error('Bot API stub has no TCP address');
        }
        const stub = new BotApiStub(server, `http://127.0.0.1:${String(portOf(address))}`);
        server.on('request', (request, response) => {
            void stub.handle(request, response);
        });
        return stub;
    }

    respond(method: string, responder: BotApiStubResponder | BotApiStubReply): void {
        this.responders.set(method, typeof responder === 'function' ? responder : () => responder);
    }

    requestsOf(method: string): BotApiStubRequest[] {
        return this.requests.filter((request) => request.method === method);
    }

    reset(): void {
        this.requests.length = 0;
        this.responders.clear();
    }

    async stop(): Promise<void> {
        for (const timer of this.pendingTimers) clearTimeout(timer);
        this.pendingTimers.clear();
        this.server.closeAllConnections();
        await new Promise<void>((resolve) =>
            this.server.close(() => {
                resolve();
            }),
        );
    }

    private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
        const match = PATH_PATTERN.exec(request.url ?? '');
        if (match === null) {
            response.writeHead(404, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ ok: false, error_code: 404, description: 'Not Found' }));
            return;
        }
        const [, token = '', method = ''] = match;
        const stubRequest = { token, method, body: parseJson(await readBody(request)) };
        this.requests.push(stubRequest);
        const reply = (this.responders.get(method) ?? (() => DEFAULT_REPLY))(stubRequest);
        const send = (): void => {
            response.writeHead(reply.status, { 'content-type': 'application/json' });
            response.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body));
        };
        if (reply.delayMs === undefined) {
            send();
            return;
        }
        const timer = setTimeout(() => {
            this.pendingTimers.delete(timer);
            if (!response.destroyed) send();
        }, reply.delayMs);
        this.pendingTimers.add(timer);
    }
}

function portOf(address: AddressInfo): number {
    return address.port;
}
