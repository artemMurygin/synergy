import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'
import { BUG_STATUS_PRESENTATION } from '../model/bug-presentation'
import type { Bug } from '../model/bugs.schema'

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s?г\.$/, '')
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const longDateTime = (iso: string) =>
  `${longDate(iso)}, ${new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`

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

function Card({ id, title, icon, children, className }: { id: string; title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 min-[900px]:gap-3.5 min-[900px]:p-6', className)}>
      <div className="flex items-center gap-2">
        {icon}
        <h2 id={id} className="text-[13px] font-bold leading-[15px] text-ink">
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-[900px]:flex-col min-[900px]:items-start min-[900px]:justify-start min-[900px]:gap-1">
      <dt className="text-[13px] font-medium text-ink-60 min-[900px]:text-xs">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-semibold text-ink">{children}</dd>
    </div>
  )
}

export interface BugDetailsProps {
  bug: Bug
  /** The agent is archived: its name is shown as plain text instead of a link to the card. */
  agentArchived?: boolean
  /** Developer status actions; when given the screen leads back to the queue and the card takes the first place of the aside. */
  actions?: ReactNode
  /** Comments feed; the last card of the main column. */
  comments?: ReactNode
}

export function BugDetails({ bug, agentArchived = false, actions, comments }: BugDetailsProps) {
  const presentation = BUG_STATUS_PRESENTATION[bug.status]
  const changedBy = bug.statusChangedBy
  const reasonAuthor = changedBy ? `${changedBy.fullName} · ${longDate(bug.statusChangedAt)}` : null
  return (
    <article className="flex flex-col gap-3.5 min-[900px]:gap-6">
      <header className="flex flex-col gap-2 min-[900px]:gap-2.5">
        <Link
          to={actions ? '/bugs/queue' : '/bugs'}
          className="flex items-center gap-1.5 self-start text-[13px] font-semibold leading-4 text-ink-60 hover:text-ink"
        >
          <Svg>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </Svg>
          {actions ? 'Баги' : 'Поддержка'}
        </Link>
        <div className="flex flex-col gap-2 min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-3.5">
          <h1 className="min-w-0 break-words font-display text-2xl font-bold leading-[1.2] tracking-[-0.4px] text-ink min-[900px]:text-[30px] min-[900px]:leading-[38px] min-[900px]:tracking-[-0.6px]">
            {bug.title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone={presentation.tone} className={presentation.className}>
              {presentation.label}
            </Badge>
            <span className="text-xs text-ink-60 min-[900px]:hidden">подано {shortDate(bug.createdAt)}</span>
          </div>
        </div>
        <p className="hidden text-[13px] leading-[15px] text-ink-60 min-[900px]:block">Подано {longDate(bug.createdAt)}</p>
      </header>

      <div className="flex flex-col gap-3.5 min-[900px]:grid min-[900px]:grid-cols-[minmax(0,1fr)_380px] min-[900px]:items-start min-[900px]:gap-6">
        <div className="contents min-[900px]:flex min-[900px]:flex-col min-[900px]:gap-6">
          {bug.status === 'wont_fix' && bug.wontFixReason ? (
            <div className="order-1 min-[900px]:order-none">
              <Card
                id="bug-reason"
                title="Почему не будет исправлено"
                icon={
                  <Svg className="text-ink-60">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m4.9 4.9 14.2 14.2" />
                  </Svg>
                }
              >
                <p className="whitespace-pre-wrap break-words text-sm leading-[1.5] text-ink-80 min-[900px]:text-[15px]">{bug.wontFixReason}</p>
                {reasonAuthor ? <p className="text-xs text-ink-60">{reasonAuthor}</p> : null}
              </Card>
            </div>
          ) : null}
          <div className="order-3 min-[900px]:order-none">
            <Card id="bug-description" title="Подробности">
              <p className="whitespace-pre-wrap break-words text-sm leading-[1.5] text-ink-80 min-[900px]:text-[15px]">{bug.description}</p>
            </Card>
          </div>
          {comments ? <div className="order-4 min-[900px]:order-none">{comments}</div> : null}
        </div>

        <div className="contents min-[900px]:flex min-[900px]:flex-col min-[900px]:gap-4">
          {actions ? <div className="order-1 min-[900px]:order-none">{actions}</div> : null}
          <div className="order-2 min-[900px]:order-none">
            <Card id="bug-facts" title="Обращение">
              <dl className="flex flex-col gap-3 min-[900px]:gap-4">
                <Fact label="Продукт">{bug.product.name}</Fact>
                <Fact label="Агент">
                  {agentArchived ? (
                    bug.agent.name
                  ) : (
                    <Link to={`/catalog/agents/${encodeURIComponent(bug.agent.id)}`} className="inline-flex items-center gap-1.5 text-brand-red hover:underline">
                      {bug.agent.name}
                      <Svg size={14}>
                        <path d="M7 7h10v10" />
                        <path d="M7 17 17 7" />
                      </Svg>
                    </Link>
                  )}
                </Fact>
                <Fact label="Автор">
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[10px] font-semibold text-ink-80 min-[900px]:size-7"
                    >
                      {initials(bug.author.fullName)}
                    </span>
                    {bug.author.fullName}
                  </span>
                </Fact>
                <Fact label="Подано">{longDateTime(bug.createdAt)}</Fact>
                {changedBy ? (
                  <Fact label="Статус изменён">
                    {longDateTime(bug.statusChangedAt)} · {changedBy.fullName}
                  </Fact>
                ) : null}
              </dl>
            </Card>
          </div>
          <div className="order-5 min-[900px]:order-none">
            <div role="status" className="flex flex-col gap-1 rounded-md bg-surface-sunken px-3.5 py-3">
              <p className="text-[13px] font-semibold leading-[15px] text-ink">Следим за статусом за вас</p>
              <p className="text-xs leading-[1.4] text-ink-80">О смене статуса и новых комментариях придёт уведомление в портале и в Telegram.</p>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
