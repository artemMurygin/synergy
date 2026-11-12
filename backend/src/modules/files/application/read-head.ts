import { Readable } from 'node:stream';

export interface StreamHead {
    head: Buffer;
    /** Весь исходный поток, включая уже прочитанное начало. */
    stream: Readable;
}

export async function readHead(source: Readable, size: number): Promise<StreamHead> {
    const iterator: AsyncIterator<unknown> = source[Symbol.asyncIterator]();
    const chunks: Buffer[] = [];
    let length = 0;
    let done = false;
    while (length < size) {
        const next = await iterator.next();
        if (next.done === true) {
            done = true;
            break;
        }
        const chunk = toBuffer(next.value);
        chunks.push(chunk);
        length += chunk.length;
    }
    const buffered = Buffer.concat(chunks);

    async function* replay(): AsyncGenerator<Buffer> {
        if (buffered.length > 0) yield buffered;
        while (!done) {
            const next = await iterator.next();
            if (next.done === true) {
                done = true;
                return;
            }
            yield toBuffer(next.value);
        }
    }

    const stream = Readable.from(replay());
    // Потребитель оборвал чтение: закрываем исходный поток.
    stream.once('close', () => {
        if (!done) source.destroy();
    });
    return { head: buffered.subarray(0, size), stream };
}

function toBuffer(chunk: unknown): Buffer {
    if (Buffer.isBuffer(chunk)) return chunk;
    if (typeof chunk === 'string' || chunk instanceof Uint8Array) return Buffer.from(chunk);
    throw new TypeError('Unexpected stream chunk type');
}
