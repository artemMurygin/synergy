import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { controlClass } from '@/components/ui/form-field'
import { cn } from '@/lib/utils'
import type { IdeaRequest } from '@/lib/schemas'
import { parseRequestForm, type RequestFormErrors, type RequestFormValues } from '../model/requests.schema'
import { useSubmitRequest } from '../model/use-submit-request'

const PERIODS = [
  { value: 'day', label: 'в день', genitive: 'в день', perMonth: 22 },
  { value: 'week', label: 'в неделю', genitive: 'в неделю', perMonth: 52 / 12 },
  { value: 'month', label: 'в месяц', genitive: 'в месяц', perMonth: 1 }
] as const

const EMPTY: RequestFormValues = { title: '', description: '', count: '', period: 'week', minutesPerRun: '', peopleCount: '' }

const STEPS = [
  { title: 'Разработчик рассмотрит заявку', note: 'Обычно 2–3 рабочих дня' },
  { title: 'Примет в навык или объяснит отказ', note: 'Причина отказа всегда видна в заявке' },
  { title: 'Статус обновится сам', note: 'Уведомление придёт в приложение и Telegram' }
]

interface Savings {
  hours: number
  formula: string
}

/** Client-side estimate of hours saved per month, from the numbers already typed in. */
function estimateSavings(values: RequestFormValues): Savings | null {
  const positive = (s: string) => (/^\d+$/.test(s.trim()) && Number(s) > 0 ? Number(s) : null)
  const count = positive(values.count)
  const minutes = positive(values.minutesPerRun)
  const people = positive(values.peopleCount)
  const period = PERIODS.find((p) => p.value === values.period)
  if (count === null || minutes === null || people === null || !period) return null
  return {
    hours: Math.floor((count * minutes * people * period.perMonth) / 60),
    formula: `${String(count)} раз ${period.genitive} × ${String(minutes)} мин × ${String(people)} чел.`
  }
}

function formatHours(savings: Savings | null) {
  if (!savings) return '—'
  return savings.hours < 1 ? '< 1 ч' : `≈ ${String(savings.hours)} ч`
}

function Icon({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn('shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

const TrendingUp = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </Icon>
)

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <div className="flex items-center gap-1.5 text-brand-red">
      <Icon className="size-3.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" x2="12" y1="8" y2="12" />
        <line x1="12" x2="12.01" y1="16" y2="16" />
      </Icon>
      <p id={id} className="text-xs">
        {children}
      </p>
    </div>
  )
}

function pluralFields(n: number) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'поле'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'поля'
  return 'полей'
}

export function RequestForm({ onSubmitted, onCancel }: { onSubmitted: (request: IdeaRequest) => void; onCancel?: () => void }) {
  const [values, setValues] = useState<RequestFormValues>(EMPTY)
  const [errors, setErrors] = useState<RequestFormErrors>({})
  const submit = useSubmitRequest()

  const set = (field: keyof RequestFormValues) => (value: string) => setValues((v) => ({ ...v, [field]: value }))
  const savings = estimateSavings(values)
  const errorCount = Object.keys(errors).length

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = parseRequestForm(values)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    // on failure the values stay in state: the form is never cleared here
    submit.mutate(parsed.data, { onSuccess: onSubmitted })
  }

  return (
    <div className="flex flex-col gap-4 min-[1024px]:flex-row min-[1024px]:items-start min-[1024px]:gap-6">
      <div className="flex items-center gap-3 rounded-lg bg-brand-red-soft px-4 py-3.5 min-[640px]:hidden">
        <TrendingUp className="size-5 text-brand-red" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-display text-lg font-bold text-brand-red">{savings ? `${formatHours(savings)} в месяц` : '—'}</p>
          <p className="text-xs text-ink-80">экономии на всю команду по вашим цифрам</p>
        </div>
      </div>

      <form
        noValidate
        onSubmit={handleSubmit}
        className="flex min-w-0 flex-1 flex-col gap-[18px] rounded-lg border border-border bg-surface p-5 min-[640px]:gap-[22px] min-[640px]:p-7"
      >
        {errorCount > 0 ? (
          <div role="alert" className="flex items-start gap-2.5 rounded-md bg-brand-red-soft px-3.5 py-3">
            <Icon className="size-[18px] text-brand-red">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="8" y2="12" />
              <line x1="12" x2="12.01" y1="16" y2="16" />
            </Icon>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-[13px] font-semibold text-ink">{`Проверьте ${String(errorCount)} ${pluralFields(errorCount)}`}</p>
              <p className="text-xs leading-[1.4] text-ink-80">Исправьте отмеченные поля и отправьте идею ещё раз.</p>
            </div>
          </div>
        ) : null}
        {submit.isError ? (
          <div role="alert" className="flex items-start gap-2.5 rounded-md bg-brand-red-soft px-3.5 py-3">
            <Icon className="size-[18px] text-brand-red">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="8" y2="12" />
              <line x1="12" x2="12.01" y1="16" y2="16" />
            </Icon>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-[13px] font-semibold text-ink">Не удалось отправить идею</p>
              <p className="text-xs leading-[1.4] text-ink-80">{submit.error.message}</p>
            </div>
          </div>
        ) : null}
        <Input label="Название" value={values.title} error={errors.title} onChange={(e) => set('title')(e.target.value)} />
        <Textarea
          label="Описание процесса"
          hint="как это делается сейчас"
          className="h-[132px] min-[640px]:h-[120px]"
          value={values.description}
          error={errors.description}
          onChange={(e) => set('description')(e.target.value)}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-ink">Как часто</legend>
          <div className="flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-center min-[640px]:gap-2.5">
            <input
              aria-label="Сколько раз"
              inputMode="numeric"
              value={values.count}
              aria-invalid={errors.count ? true : undefined}
              aria-describedby={errors.count ? 'count-error' : undefined}
              onChange={(e) => set('count')(e.target.value)}
              className={cn(controlClass, 'h-[52px] min-[640px]:w-24')}
            />
            <div role="radiogroup" aria-label="Период" className="flex gap-2">
              {PERIODS.map((p) => (
                <label
                  key={p.value}
                  className={cn(
                    'flex h-11 flex-1 cursor-pointer items-center justify-center rounded-pill border border-border-strong bg-surface px-[18px] text-sm font-medium text-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring min-[640px]:h-[52px] min-[640px]:flex-none',
                    values.period === p.value && 'border-ink bg-ink text-surface'
                  )}
                >
                  <input
                    type="radio"
                    name="period"
                    className="sr-only"
                    value={p.value}
                    checked={values.period === p.value}
                    onChange={() => set('period')(p.value)}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
          {errors.count ? <FieldError id="count-error">{errors.count}</FieldError> : null}
          {errors.period ? <FieldError id="period-error">{errors.period}</FieldError> : null}
        </fieldset>
        <div className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-2">
          <Input
            label="Минут за один раз"
            inputMode="numeric"
            value={values.minutesPerRun}
            error={errors.minutesPerRun}
            onChange={(e) => set('minutesPerRun')(e.target.value)}
          />
          <Input
            label="Сколько человек так делают"
            inputMode="numeric"
            value={values.peopleCount}
            error={errors.peopleCount}
            onChange={(e) => set('peopleCount')(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-3 pt-1 min-[640px]:flex-row min-[640px]:items-center min-[640px]:pt-2">
          <p className="hidden min-w-0 flex-1 items-center gap-1.5 text-xs text-ink-60 min-[640px]:flex">
            <Icon className="size-3.5 text-ink-40">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </Icon>
            Заявку увидят только вы и разработчики
          </p>
          <Button
            type="submit"
            disabled={submit.isPending}
            className="max-[639px]:w-full min-[640px]:order-2"
          >
            {submit.isPending ? 'Отправляем…' : 'Отправить идею'}
            <Icon className="size-[18px]">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </Icon>
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} className="max-[639px]:w-full min-[640px]:order-1">
            Отмена
          </Button>
        </div>
      </form>

      <aside className="hidden w-[380px] shrink-0 flex-col gap-4 min-[1024px]:flex">
        <section className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-6">
          <h2 className="flex items-center gap-2 text-[13px] font-bold text-ink">
            <TrendingUp className="size-4 text-brand-red" />
            Оценка эффекта
          </h2>
          <div className="flex flex-col gap-1 rounded-lg bg-brand-red-soft p-5">
            <p className="font-display text-[40px] font-medium leading-none text-brand-red">{formatHours(savings)}</p>
            <p className="text-sm font-semibold text-ink">в месяц на всю команду</p>
            <p className="text-xs leading-[1.45] text-ink-60">{savings ? savings.formula : 'Заполните цифры ниже, и мы посчитаем'}</p>
          </div>
          <p className="text-xs leading-[1.45] text-ink-60">
            Пересчитывается по мере заполнения анкеты. Разработчик уточнит оценку при рассмотрении.
          </p>
        </section>
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
          <h2 className="text-[13px] font-bold text-ink">Что будет дальше</h2>
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex gap-3">
              <span
                className={cn(
                  'flex size-[26px] shrink-0 items-center justify-center rounded-pill text-xs font-bold',
                  i === 0 ? 'bg-ink text-surface' : 'bg-surface-sunken text-ink-80'
                )}
              >
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm font-semibold text-ink">{step.title}</p>
                <p className="text-xs text-ink-60">{step.note}</p>
              </div>
            </div>
          ))}
        </section>
      </aside>
    </div>
  )
}
