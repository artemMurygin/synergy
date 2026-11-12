import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readHead } from './read-head';
import { readAll } from './test-doubles';

describe('readHead', () => {
    it('returns the first bytes and replays the whole stream', async () => {
        const chunks = [Buffer.alloc(3000, 1), Buffer.alloc(3000, 2), Buffer.alloc(10, 3)];

        const { head, stream } = await readHead(Readable.from(chunks), 4100);

        expect(head.length).toBe(4100);
        expect(head.equals(Buffer.concat(chunks).subarray(0, 4100))).toBe(true);
        expect((await readAll(stream)).equals(Buffer.concat(chunks))).toBe(true);
    });

    it('handles a stream shorter than the head', async () => {
        const { head, stream } = await readHead(Readable.from([Buffer.from('abc')]), 4100);

        expect(head.toString()).toBe('abc');
        expect((await readAll(stream)).toString()).toBe('abc');
    });

    it('returns an empty head for an empty stream', async () => {
        const { head, stream } = await readHead(Readable.from([]), 4100);

        expect(head.length).toBe(0);
        expect((await readAll(stream)).length).toBe(0);
    });

    it('closes the source when the consumer stops early', async () => {
        const source = Readable.from([Buffer.alloc(5000), Buffer.alloc(5000), Buffer.alloc(5000)]);
        const { stream } = await readHead(source, 4100);

        stream.destroy();
        await new Promise((resolve) => setImmediate(resolve));

        expect(source.destroyed).toBe(true);
    });
});
