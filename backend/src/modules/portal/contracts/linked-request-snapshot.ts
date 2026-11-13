import { z } from 'zod';

/** Строка снимка заявок, привязанных к навыку, внутри `SkillStatusChanged`. */
export const linkedRequestSnapshotSchema = z.object({
    requestId: z.string().min(1),
    authorId: z.string().min(1),
    title: z.string().min(1),
});

export type LinkedRequestSnapshot = z.infer<typeof linkedRequestSnapshotSchema>;
