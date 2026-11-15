import { z } from 'zod';

/** Грубая защита от огромных тел; точный лимит (после trim) проверяет `GuideBody`. */
export const MAX_GUIDE_REQUEST_LENGTH = 200000;

export const saveGuideSchema = z.object({ body: z.string().max(MAX_GUIDE_REQUEST_LENGTH) });
export type SaveGuideBody = z.infer<typeof saveGuideSchema>;
