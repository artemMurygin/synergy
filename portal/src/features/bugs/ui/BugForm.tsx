import type { FormEvent, ReactNode } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useBugForm, type BugFormProduct } from '../model/bug-form'
import { bugErrorMessage } from '../model/bugs.errors'
import { useReportBug } from '../model/use-report-bug'

const STEPS = [
  { title: 'Разработчик возьмёт обращение в работу', note: 'Статус сменится на «В работе»' },
  { title: 'Уточнит детали в комментариях', note: 'Ответить можно на экране обращения' },
  { title: 'Сообщим, когда проблему исправят', note: 'В портале и в Telegram' }
]

export interface BugFormProps {
  products: BugFormProduct[]
  initialAgentId?: string
  onReported: (bugId: string) => void
  onCancel?: () => void
}

function Icon({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

export function BugForm({ products, initialAgentId, onReported, onCancel }: BugFormProps) {
  const form = useBugForm(products, initialAgentId)
  const report = useReportBug()
  const { values, errors } = form

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const body = form.submit()
    if (!body) return
    // on failure the typed text stays in the form state
    report.mutate(body, {
      onSuccess: (bug) => onReported(bug.id),
      onError: (error) => {
        if (error.kind === 'conflict') form.clearAgent()
      }
    })
  }

  return (
    <div className="flex flex-col gap-4 min-[1024px]:flex-row min-[1024px]:items-start min-[1024px]:gap-6">
      <form
        noValidate
        onSubmit={handleSubmit}
        className="flex min-w-0 flex-1 flex-col gap-[18px] rounded-lg border border-border bg-surface p-5 min-[640px]:gap-[22px] min-[640px]:p-7"
      >
        {report.isError ? (
          <Alert tone="error" title={bugErrorMessage(report.error)}>
            {report.error.kind === 'conflict' ? 'Выберите другого агента: список обновлён, введённый текст сохранён.' : undefined}
          </Alert>
        ) : null}
        <div className="grid grid-cols-1 gap-[18px] min-[640px]:grid-cols-2 min-[640px]:gap-4">
          <Select
            label="Продукт"
            value={values.productId}
            error={errors.productId}
            onChange={(e) => form.setProduct(e.target.value)}
            className="min-[640px]:h-[52px] max-[639px]:h-12"
          >
            <option value="">Выберите из списка</option>
            {form.productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select
            label="Агент"
            value={values.agentId}
            error={errors.agentId}
            disabled={!values.productId}
            onChange={(e) => form.setField('agentId', e.target.value)}
            className={cn('max-[639px]:h-12', !values.productId && 'bg-surface-alt')}
          >
            <option value="">Выберите из списка</option>
            {form.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <Input
          label="Что случилось"
          hint="коротко, до 200 символов"
          value={values.title}
          error={errors.title}
          onChange={(e) => form.setField('title', e.target.value)}
          className="max-[639px]:h-12"
        />
        <Textarea
          label="Подробности"
          hint="что делали, что произошло, что ожидали"
          className="h-[180px]"
          value={values.description}
          error={errors.description}
          onChange={(e) => form.setField('description', e.target.value)}
        />
        <div className="flex flex-col gap-3 pt-1 min-[640px]:flex-row min-[640px]:items-center min-[640px]:pt-2">
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink-60 min-[640px]:flex-1">
            <Icon className="size-3.5 shrink-0 text-ink-40">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </Icon>
            Обращение увидят только вы и разработчики
          </p>
          <Button type="submit" disabled={report.isPending} className="max-[639px]:order-1 max-[639px]:w-full min-[640px]:order-2">
            {report.isPending ? 'Отправляем…' : 'Отправить'}
            <Icon className="size-[18px]">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </Icon>
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} className="max-[639px]:order-2 max-[639px]:w-full min-[640px]:order-1">
            Отмена
          </Button>
        </div>
      </form>

      <aside className="hidden w-[380px] shrink-0 flex-col gap-4 min-[1024px]:flex">
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
          <h2 className="text-[13px] font-bold text-ink">Что будет дальше</h2>
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex gap-3">
              <span
                className={cn(
                  'flex size-[26px] shrink-0 items-center justify-center rounded-pill text-xs font-bold',
                  i === 0 ? 'bg-ink text-surface' : 'bg-surface-sunken text-ink-60'
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
