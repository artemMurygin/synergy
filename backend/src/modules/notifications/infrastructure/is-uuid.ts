import { z } from 'zod';

const uuidSchema = z.guid();

export function isUuid(value: string): boolean {
    return uuidSchema.safeParse(value).success;
}
