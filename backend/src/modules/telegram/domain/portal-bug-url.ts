export function portalBugUrl(base: string, bugId: string): string {
    return `${base}/bugs/${encodeURIComponent(bugId)}`;
}
