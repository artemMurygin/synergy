import { z } from 'zod'

export const itemSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.enum(['active', 'paused', 'done'])
})

export type Item = z.infer<typeof itemSchema>
