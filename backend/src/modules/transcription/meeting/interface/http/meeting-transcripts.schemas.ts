import { z } from 'zod';

// Длина и пустота имени проверяются доменом (422), здесь только форма тела и разумный предел.
const MAX_NAME_INPUT = 1000;
const MAX_ASSIGNMENTS = 100;

export const renameSpeakersRequestSchema = z.object({
    speakers: z
        .array(
            z.object({
                speaker: z.number().int(),
                /** `null` или пустая строка сбрасывает имя к «Спикер N». */
                name: z.string().max(MAX_NAME_INPUT).nullable(),
            }),
        )
        .min(1)
        .max(MAX_ASSIGNMENTS),
});
export type RenameSpeakersRequest = z.infer<typeof renameSpeakersRequestSchema>;
