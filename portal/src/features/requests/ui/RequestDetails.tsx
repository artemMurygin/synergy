import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { formatEffortHours } from '@/lib/format'
import { initials } from '@/lib/initials'
import { REQUEST_STATUS_LABEL } from '@/lib/status-labels'
import type { IdeaRequest, RequestStatusCode } from '@/lib/schemas'
import { RequestStatusBadge } from './RequestStatusBadge'

const FLOW: readonly RequestStatusCode[] = ['new', 'under_review', 'planned', 'in_dev', 'testing', 'launched']
const REJECTED_FLOW: readonly RequestStatusCode[] = ['new', 'under_review', 'rejected']
const AWAITING: readonly RequestStatusCode[] = ['new', 'under_review']
const WEEKS_PER_MONTH = 4.3
const DAYS_PER_MONTH = 30

const PERIOD_FULL = { day: 'день', week: 'нед', month: 'мес' } as const

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s?г\.$/, '')
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
const dayTime = (iso: string) => {
  const d = new Date(iso)
  const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `${date}, ${time}`
}

function waitingDays(iso: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

function pluralDays(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${String(n)} день`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${String(n)} дня`
  return `${String(n)} дней`
}

/** Estimated hours saved per month, computed on the client from the questionnaire. */
function monthlySavings(request: IdeaRequest): string {
  const perMonth =
    request.frequency.period === 'day'
      ? request.frequency.count * DAYS_PER_MONTH
      : request.frequency.period === 'week'
        ? request.frequency.count * WEEKS_PER_MONTH
        : request.frequency.count
  const hours = (perMonth * request.minutesPerRun * request.peopleCount) / 60
  const value = hours < 10 ? (Math.floor(hours * 10) / 10).toString().replace('.', ',') : String(Math.floor(hours))
  return `≈ ${value} ч`
}

function Svg({ children, size = 16, className }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
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

function Card({ title, aside, className = '', children }: { title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`flex flex-col rounded-lg border border-border bg-surface p-6 ${className}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold leading-[15px] text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Fact({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-surface-alt p-3.5 min-[900px]:p-4">
      <dd className={`font-display text-[22px] font-medium leading-none tracking-[-0.4px] ${accent ? 'text-brand-red' : 'text-ink'}`}>
        {value}
      </dd>
      <dt className="text-xs font-medium text-ink-60">{label}</dt>
    </div>
  )
}

type StepState = 'done' | 'current' | 'upcoming' | 'rejected'

function Step({ title, meta, state, last }: { title: string; meta?: string; state: StepState; last: boolean }) {
  const dot =
    state === 'done'
      ? 'bg-ink text-white'
      : state === 'rejected'
        ? 'border-2 border-brand-red bg-brand-red text-white'
        : state === 'current'
          ? 'border-2 border-brand-red bg-brand-red-soft'
          : 'border-2 border-border-strong'
  const titleCls =
    state === 'current'
      ? 'font-bold text-ink'
      : state === 'rejected'
        ? 'font-bold text-brand-red'
        : state === 'done'
          ? 'font-medium text-ink'
          : 'font-medium text-ink-40'
  return (
    <li aria-current={state === 'current' || state === 'rejected' ? 'step' : undefined} className="flex gap-3">
      <div className="relative w-[22px] shrink-0">
        <span className={`flex size-[22px] items-center justify-center rounded-full ${dot}`}>
          {state === 'done' ? (
            <Svg size={13}>
              <path d="M20 6 9 17l-5-5" />
            </Svg>
          ) : null}
          {state === 'rejected' ? (
            <Svg size={13}>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </Svg>
          ) : null}
          {state === 'current' ? <span className="size-2 rounded-full bg-brand-red" /> : null}
        </span>
        {last ? null : (
          <span className={`absolute bottom-0 left-2.5 top-[22px] w-0.5 ${state === 'done' ? 'bg-ink' : 'bg-border'}`} />
        )}
      </div>
      <div className={`flex min-w-0 flex-col gap-px pt-px ${last ? '' : 'pb-3.5'}`}>
        <span className={`text-sm leading-4 ${titleCls}`}>{title}</span>
        {meta ? (
          <span className="text-xs leading-[14px] text-ink-60">{meta}</span>
        ) : state === 'done' || state === 'current' ? (
          <span aria-hidden="true" className="h-[14px]" />
        ) : null}
      </div>
    </li>
  )
}

function StatusSteps({ request }: { request: IdeaRequest }) {
  const code = request.status.code
  const flow = code === 'rejected' ? REJECTED_FLOW : FLOW
  const index = flow.indexOf(code)
  const finished = code === 'rejected' || code === 'launched'
  const count = code === 'rejected' ? 'завершена' : `шаг ${String(index + 1)} из ${String(flow.length)}`
  return (
    <Card title="Путь заявки" aside={<span className="text-xs text-ink-60">{count}</span>} className="gap-4">
      <ol aria-label="Путь заявки" className="flex flex-col">
        {flow.map((step, i) => {
          const state: StepState =
            step === 'rejected' ? 'rejected' : i < index || (finished && step === 'launched') ? 'done' : i === index ? 'current' : 'upcoming'
          const meta =
            step === 'new'
              ? dayMonth(request.createdAt)
              : step === 'under_review' && request.reviewer && request.takenAt
                ? `${dayMonth(request.takenAt)} · ${request.reviewer.fullName}`
                : step === 'rejected'
                  ? 'причина ниже'
                  : undefined
          return <Step key={step} title={REQUEST_STATUS_LABEL[step]} meta={meta} state={state} last={i === flow.length - 1} />
        })}
      </ol>
    </Card>
  )
}

function SkillCard({ request }: { request: IdeaRequest }) {
  if (request.skill) {
    return (
      <Card title="Навык" className="gap-3.5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-80">
            <Svg size={20}>
              <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
              <path d="M20 3v4" />
              <path d="M22 5h-4" />
              <path d="M4 17v2" />
              <path d="M5 18H3" />
            </Svg>
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="break-words text-[15px] font-semibold leading-[18px] text-ink">{request.skill.name}</p>
            <p className="break-words text-xs text-ink-60">{request.skill.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Svg size={15} className="shrink-0 text-ink-40">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </Svg>
          <span className="min-w-0 flex-1 text-[13px] text-ink-60">Оценка разработчика</span>
          <span className="text-[13px] font-bold text-ink">{formatEffortHours(request.effortHours)}</span>
        </div>
      </Card>
    )
  }
  if (!AWAITING.includes(request.status.code)) return null
  return (
    <Card title="Навык" className="gap-3.5">
      <p className="text-[13px] leading-[1.45] text-ink-60">
        Появится после решения разработчика. Несколько похожих заявок могут объединить в один навык.
      </p>
    </Card>
  )
}

function Notice({ title, children, tone = 'info' }: { title: string; children: ReactNode; tone?: 'info' | 'error' }) {
  const error = tone === 'error'
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-md ${error ? 'bg-brand-red-soft px-[18px] py-4' : 'bg-info-soft px-3.5 py-3'}`}
    >
      <Svg size={18} className={`mt-0 shrink-0 ${error ? 'text-brand-red' : 'text-info'}`}>
        {error ? (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="m15 9-6 6" />
            <path d="m9 9 6 6" />
          </>
        ) : (
          <>
            <path d="M10.268 21a2 2 0 0 0 3.464 0" />
            <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
          </>
        )}
      </Svg>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={`font-semibold text-ink ${error ? 'text-sm leading-4' : 'text-[13px] leading-[15px]'}`}>{title}</p>
        <div className={`whitespace-pre-wrap break-words text-ink-80 ${error ? 'text-sm leading-[1.5]' : 'text-xs leading-[1.4]'}`}>
          {children}
        </div>
      </div>
    </div>
  )
}

function StatusNotice({ code }: { code: RequestStatusCode }) {
  if (AWAITING.includes(code)) {
    return <Notice title="Решение придёт уведомлением">Обычно разработчик отвечает за 2–3 рабочих дня.</Notice>
  }
  if (code === 'rejected' || code === 'launched') return null
  return <Notice title="Следим за статусом за вас">О каждом шаге придёт уведомление в Control Center и Telegram.</Notice>
}

function History({ request }: { request: IdeaRequest }) {
  return (
    <Card title="История" className="hidden min-[900px]:flex">
      <ul className="flex flex-col pt-3.5">
        <li className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[10px] font-semibold text-ink-80"
          >
            {initials(request.author.login)}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
            <span className="text-sm font-medium leading-4 text-ink">Вы подали заявку</span>
            <span className="text-xs leading-[14px] text-ink-60">{dayTime(request.createdAt)}</span>
          </div>
        </li>
      </ul>
    </Card>
  )
}

/** Author Card · ФИО автора: avatar with initials and the full name (the stats line of the mock-up has no data in the API). */
function AuthorCard({ request }: { request: IdeaRequest }) {
  const { fullName } = request.author
  return (
    <section aria-labelledby="request-author" className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-5 min-[900px]:p-6">
      <h2 id="request-author" className="text-[13px] font-bold leading-[15px] text-ink">
        Автор
      </h2>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[13px] font-semibold text-ink-80"
        >
          {initials(fullName)}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="break-words text-[15px] leading-[18px] font-semibold text-ink">{fullName}</span>
        </div>
      </div>
    </section>
  )
}

function NextSteps() {
  return (
    <section
      aria-labelledby="request-next"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6 max-[899px]:border-0 max-[899px]:bg-transparent max-[899px]:p-0"
    >
      <h2 id="request-next" className="text-[13px] font-bold leading-[15px] text-ink max-[899px]:hidden">
        Что можно сделать
      </h2>
      <p className="text-[13px] leading-[1.45] text-ink-60 max-[899px]:hidden">
        Уточните, чем существующий навык не подходит, и подайте идею заново — она попадёт в очередь первой.
      </p>
      <Button asChild variant="outline" className="w-full min-[900px]:mt-2">
        <Link to="/ideas/new">
          <Svg size={18}>
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </Svg>
          Подать уточнённую идею
        </Link>
      </Button>
    </section>
  )
}

export interface RequestDetailsProps {
  request: IdeaRequest
  /** Developer decision panel; when given it takes the place of the author's side cards. */
  decision?: ReactNode
}

export function RequestDetails({ request, decision }: RequestDetailsProps) {
  const code = request.status.code
  const waiting = code === 'new' ? ` · ждёт решения ${pluralDays(waitingDays(request.createdAt))}` : ''
  const inWork = request.reviewer && request.takenAt ? ` · в работе у ${request.reviewer.fullName} с ${shortDate(request.takenAt)}` : ''
  const frequency = request.frequency
  return (
    <article className="flex flex-col gap-3.5 min-[900px]:gap-6">
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2 min-[900px]:grid-cols-[auto_auto_minmax(0,1fr)] min-[900px]:gap-x-3.5 min-[900px]:gap-y-2.5">
        <Link
          to="/requests"
          className="col-span-2 flex items-center gap-1.5 justify-self-start text-[13px] font-semibold leading-4 text-ink-60 hover:text-ink min-[900px]:col-span-3"
        >
          <Svg size={16}>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </Svg>
          Мои заявки
        </Link>
        <h1 className="col-span-2 break-words font-display text-2xl font-bold leading-[1.2] tracking-[-0.4px] text-ink min-[900px]:col-span-1 min-[900px]:text-[30px] min-[900px]:leading-[38px] min-[900px]:tracking-[-0.6px]">
          {request.title}
        </h1>
        <div className="justify-self-start">
          <RequestStatusBadge status={code} />
        </div>
        <p className="min-w-0 text-xs text-ink-60 min-[900px]:col-span-3 min-[900px]:text-[13px] min-[900px]:leading-[15px]">
          <span className="min-[900px]:hidden">
            {shortDate(request.createdAt)}
            {decision ? ` · ${request.author.fullName}` : ''}
            {inWork}
          </span>
          <span className="hidden min-[900px]:inline">
            Подана {longDate(request.createdAt)} · {request.author.fullName}
            {waiting}
            {inWork}
          </span>
        </p>
      </header>

      <div
        className={`flex flex-col gap-3.5 min-[900px]:grid min-[900px]:items-start min-[900px]:gap-6 ${decision ? 'min-[900px]:grid-cols-[minmax(0,1fr)_420px]' : 'min-[900px]:grid-cols-[minmax(0,1fr)_380px]'}`}
      >
        <div className="contents min-[900px]:flex min-[900px]:flex-col min-[900px]:gap-5">
          {code === 'rejected' && request.rejectReason ? (
            <div className="order-1 min-[900px]:order-none">
              <Notice title="Почему отклонена" tone="error">
                {request.rejectReason}
              </Notice>
            </div>
          ) : null}
          <section
            aria-labelledby="request-process"
            className="order-3 flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-5 min-[900px]:order-none min-[900px]:gap-[18px] min-[900px]:p-6"
          >
            <h2 id="request-process" className="text-[13px] font-bold leading-[15px] text-ink">
              Описание процесса
            </h2>
            <p className="whitespace-pre-wrap break-words text-sm leading-[1.5] text-ink-80 min-[900px]:text-[15px] min-[900px]:leading-[1.55]">
              {request.description}
            </p>
            <dl className="grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4 min-[900px]:gap-3">
              <Fact label="как часто" value={`${String(frequency.count)} / ${PERIOD_FULL[frequency.period]}`} />
              <Fact label="за один раз" value={`${String(request.minutesPerRun)} мин`} />
              <Fact label="так делают" value={`${String(request.peopleCount)} чел.`} />
              <Fact label="экономии в месяц" value={monthlySavings(request)} accent />
            </dl>
          </section>
          {code === 'rejected' ? null : <History request={request} />}
        </div>

        <div className="contents min-[900px]:flex min-[900px]:flex-col min-[900px]:gap-4">
          {decision ? (
            <>
              <div className="order-1 min-[900px]:order-none">{decision}</div>
              <div className="order-5 min-[900px]:order-none">
                <AuthorCard request={request} />
              </div>
            </>
          ) : (
            <>
              <div className="order-1 min-[900px]:order-none">
                <StatusSteps request={request} />
              </div>
              <div className="order-2 empty:hidden min-[900px]:order-none">
                <SkillCard request={request} />
              </div>
              <div className="order-4 empty:hidden min-[900px]:order-none">
                <StatusNotice code={code} />
              </div>
              {code === 'rejected' ? (
                <div className="order-4 min-[900px]:order-none">
                  <NextSteps />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </article>
  )
}
