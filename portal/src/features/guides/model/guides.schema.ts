import { z } from 'zod'

const personSchema = z.object({ id: z.string(), login: z.string(), fullName: z.string() })

/** An empty guide is the same shape with every field null. */
export const guideResponseSchema = z.object({
  body: z.string().nullable(),
  updatedAt: z.string().nullable(),
  updatedBy: personSchema.nullable()
})

export type GuideResponse = z.infer<typeof guideResponseSchema>
