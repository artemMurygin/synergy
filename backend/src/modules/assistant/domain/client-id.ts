export const APP_CLIENT_IDS = ['app', 'manager-app', 'employee-app'] as const;

/** A client that reaches the backend over HTTP; "app" is an app that did not name itself. */
export type AppClientId = (typeof APP_CLIENT_IDS)[number];

export const CLIENT_IDS = [...APP_CLIENT_IDS, 'telegram'] as const;

/** The client a request comes from: one of the apps or the Telegram bot. */
export type ClientId = (typeof CLIENT_IDS)[number];

export class InvalidClientIdError extends Error {
    constructor(value: unknown) {
        super(`Unknown client: ${String(value)}`);
    }
}

export const ClientId = {
    parse(value: unknown): ClientId {
        const found = CLIENT_IDS.find((id) => id === value);
        if (found === undefined) throw new InvalidClientIdError(value);
        return found;
    },
    /** True for the clients that reach the backend over HTTP (everything but Telegram). */
    isApp(client: ClientId): client is AppClientId {
        return client !== 'telegram';
    },
};
