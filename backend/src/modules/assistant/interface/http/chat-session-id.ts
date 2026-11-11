import { NotFoundException } from '@nestjs/common';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertChatSessionIdFormat(id: string): void {
    // A malformed id cannot belong to any chat; avoids a Postgres uuid cast error (500).
    if (!UUID_PATTERN.test(id.trim())) {
        throw new NotFoundException(`Chat session not found: ${id}`);
    }
}
