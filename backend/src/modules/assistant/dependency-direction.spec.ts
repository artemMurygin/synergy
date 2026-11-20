import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Files of a layer, recursively. */
function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sources(path);
        return entry.name.endsWith('.ts') ? [path] : [];
    });
}

describe('assistant dependency direction', () => {
    it.each(['domain', 'application'])('%s does not import the HTTP layer', (layer) => {
        const offenders = sources(join(__dirname, layer)).filter((file) =>
            /from '[^']*shared\/http\/[^']*'/.test(readFileSync(file, 'utf8')),
        );
        expect(offenders).toEqual([]);
    });
});
