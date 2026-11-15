export function portalRequestUrl(base: string, requestId: string): string {
    return `${base}/requests/${encodeURIComponent(requestId)}`;
}
