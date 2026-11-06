import { z } from 'zod';

export const loginRequestSchema = z.object({
    login: z.string().min(1),
    password: z.string().min(1),
});

export const refreshTokenBodySchema = z
    .object({ refreshToken: z.string().min(1).optional() })
    .optional();

export const changePasswordRequestSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(1),
});

export const tokensResponseSchema = z.object({
    accessToken: z.string(),
    expiresIn: z.number().int().describe('Access token lifetime in seconds'),
    mustChangePassword: z.boolean(),
    refreshToken: z
        .string()
        .optional()
        .describe('Only for X-Client-Type: desktop; cookie clients get mh_refresh instead'),
});

export const currentUserResponseSchema = z.object({
    id: z.string(),
    login: z.string(),
    mustChangePassword: z.boolean(),
});

export type TokensResponse = z.infer<typeof tokensResponseSchema>;
