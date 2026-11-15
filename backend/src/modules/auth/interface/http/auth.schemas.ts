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
    roles: z
        .array(z.enum(['developer', 'admin']))
        .describe('Roles from the access token; [] if none'),
    fullName: z.string().describe('The login for a user without a profile'),
    lastName: z.string().nullable(),
    firstName: z.string().nullable(),
    middleName: z.string().nullable(),
    position: z.string().nullable(),
    department: z.object({ id: z.string(), name: z.string() }).nullable(),
});

export type TokensResponse = z.infer<typeof tokensResponseSchema>;
