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

export interface BotApiStubFileRequest {
    readonly token: string;
    readonly filePath: string;
}

export interface BotApiStubFileReply {
    readonly status: number;
    readonly body: Buffer;
}

const PATH_PATTERN = /^\/bot([^/]+)\/([A-Za-z]+)$/;
const FILE_PATH_PATTERN = /^\/file\/bot([^/]+)\/(.+)$/;
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

    readonly fileRequests: BotApiStubFileRequest[] = [];

    private readonly responders = new Map<string, BotApiStubResponder>();

    private readonly files = new Map<string, BotApiStubFileReply>();

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

    /** Serves the file at `/file/bot<token>/<filePath>`, as the Bot API file server does. */
    respondFile(filePath: string, reply: BotApiStubFileReply): void {
        this.files.set(filePath, reply);
    }

    requestsOf(method: string): BotApiStubRequest[] {
        return this.requests.filter((request) => request.method === method);
    }

    reset(): void {
        this.requests.length = 0;
        this.fileRequests.length = 0;
        this.responders.clear();
        this.files.clear();
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
        const fileMatch = FILE_PATH_PATTERN.exec(request.url ?? '');
        if (fileMatch !== null) {
            const [, token, filePath] = fileMatch;
            this.serveFile(token, filePath, response);
            return;
        }
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

    private serveFile(token: string, filePath: string, response: ServerResponse): void {
        this.fileRequests.push({ token, filePath });
        const file = this.files.get(filePath);
        if (file === undefined) {
            response.writeHead(404, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ ok: false, error_code: 404, description: 'Not Found' }));
            return;
        }
        response.writeHead(file.status, { 'content-type': 'application/octet-stream' });
        response.end(file.body);
    }
}

function portOf(address: AddressInfo): number {
    return address.port;
}
