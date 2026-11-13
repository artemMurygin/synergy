import { z } from 'zod'
import { frequencyPeriodSchema, type FrequencyPeriod } from '@/lib/schemas'

export const TITLE_MAX_LENGTH = 200

/** Raw values of the idea form: every input is a string until it passes the check. */
export interface RequestFormValues {
  title: string
  description: string
  count: string
  period: string
  minutesPerRun: string
  peopleCount: string
}

export type RequestFormField = keyof RequestFormValues
export type RequestFormErrors = Partial<Record<RequestFormField, string>>

export interface RequestBody {
  title: string
  description: string
  frequency: { count: number; period: FrequencyPeriod }
  minutesPerRun: number
  peopleCount: number
}

const positiveInteger = (message: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, message)
    .transform(Number)
    .refine((n) => Number.isSafeInteger(n) && n > 0, message)

export const requestFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Введите название идеи')
      .max(TITLE_MAX_LENGTH, `Название не длиннее ${String(TITLE_MAX_LENGTH)} символов`),
    description: z.string().trim().min(1, 'Опишите процесс'),
    count: positiveInteger('Укажите целое число больше нуля'),
    period: frequencyPeriodSchema,
    minutesPerRun: positiveInteger('Укажите целое число минут больше нуля'),
    peopleCount: positiveInteger('Укажите целое число людей больше нуля')
  })
  .strict()

export type ParsedRequestForm = { ok: true; data: RequestBody } | { ok: false; errors: RequestFormErrors }

/** Checks the form before sending and maps each problem to the field it belongs to. */
export function parseRequestForm(values: RequestFormValues): ParsedRequestForm {
  const parsed = requestFormSchema.safeParse(values)
  if (!parsed.success) {
    const errors: RequestFormErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as RequestFormField | undefined
      if (field && !errors[field]) errors[field] = field === 'period' ? 'Выберите период' : issue.message
    }
    return { ok: false, errors }
  }
  const { title, description, count, period, minutesPerRun, peopleCount } = parsed.data
  return {
    ok: true,
    data: { title, description, frequency: { count, period }, minutesPerRun, peopleCount }
  }
}
