const SCHEME_WILDCARD = '://*';

/** An entry is an exact origin or `scheme://*`, which matches any host of that scheme, nothing else. */
export function isOriginAllowed(origin: string, allowed: readonly string[]): boolean {
    return allowed.some((entry) => {
        if (!entry.endsWith(SCHEME_WILDCARD)) return entry === origin;
        const prefix = entry.slice(0, -1);
        if (!origin.startsWith(prefix)) return false;
        const host = origin.slice(prefix.length);
        return host !== '' && !host.includes('/');
    });
}
