const TOKEN_IN_QUERY = /([?&]token=)[^&#]*/g;
const CENSOR = '[Redacted]';

/** Прячет `token` из строки запроса в `url` (ссылки скачивания); `query.token` режет redact. */
export function serializeRequest<T extends { url?: unknown }>(req: T): T {
    if (typeof req.url !== 'string' || !req.url.includes('token=')) return req;
    return { ...req, url: req.url.replace(TOKEN_IN_QUERY, `$1${CENSOR}`) };
}
