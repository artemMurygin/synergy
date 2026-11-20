import { BadRequestException } from '@nestjs/common';
import { type AppClientId, ClientId } from '../client/client-id';

export const CLIENT_APP_HEADER = 'X-Client-App';

interface HeaderSource {
    header(name: string): string | undefined;
}

/** Determines the client of an HTTP request from the X-Client-App header only; the body is never read. */
export class ClientResolver {
    resolve(request: HeaderSource): AppClientId {
        const value = request.header(CLIENT_APP_HEADER);
        if (value === undefined) return 'app';
        const client = this.parse(value);
        // Telegram is set only by the Telegram channel itself, never by an HTTP header.
        // "app" is the neutral value for a missing header, not something a client may send.
        if (!ClientId.isApp(client) || client === 'app') throw this.invalid();
        return client;
    }

    private parse(value: string): ClientId {
        try {
            return ClientId.parse(value);
        } catch {
            throw this.invalid();
        }
    }

    private invalid(): BadRequestException {
        return new BadRequestException(
            `${CLIENT_APP_HEADER} must be "manager-app" or "employee-app"`,
        );
    }
}
