import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/format'
import type { CatalogAgent } from '@/lib/schemas'
import { SKILL_BADGE_CLASS, SKILL_STATUS_LABEL } from '@/lib/status-labels'
import { AgentStatusBadge } from './AgentStatusBadge'
import { ProductAccessLabel } from './ProductAccessLabel'

const SVG = { 'aria-hidden': true, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const COLUMNS = 'min-[768px]:grid min-[768px]:grid-cols-[minmax(0,1fr)_160px_140px] min-[768px]:items-center min-[768px]:gap-4'

/** Agent card: header (name, products one per row with their departments, derived status, `actions` slot) and the list of its skills. */
export function AgentCard({ agent, actions }: { agent: CatalogAgent; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 min-[768px]:gap-6">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3.5 rounded-lg border border-border bg-surface p-5 min-[768px]:grid-cols-[auto_1fr_auto] min-[768px]:gap-x-5 min-[768px]:gap-y-2 min-[768px]:p-6">
        <span className="flex size-11 shrink-0 items-center justify-center self-center rounded-md bg-surface-sunken text-ink-80 min-[768px]:row-span-2 min-[768px]:size-14">
          <svg {...SVG} className="size-[22px] min-[768px]:size-[26px]">
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
          </svg>
        </span>
        <h1 className="self-center font-display text-2xl font-bold leading-tight tracking-[-0.4px] text-ink min-[768px]:text-[32px] min-[768px]:tracking-[-0.6px]">{agent.name}</h1>
        <div className="col-span-2 flex flex-col items-start gap-2.5 min-[768px]:col-span-1 min-[768px]:flex-row min-[768px]:items-center min-[768px]:gap-3">
          <ul aria-label="Продукты агента" className="flex min-w-0 flex-col gap-1.5 max-[767px]:order-last">
            {agent.products.map((p) => (
              <li key={p.id} className="flex min-w-0 flex-col gap-0.5 min-[768px]:flex-row min-[768px]:items-center min-[768px]:gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink-80">
                  <svg {...SVG} className="size-4 shrink-0 text-ink-60">
                    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                    <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
                    <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
                  </svg>
                  {p.name}
                </span>
                <ProductAccessLabel departments={p.departments} className="pl-6 min-[768px]:pl-0" />
              </li>
            ))}
          </ul>
          <AgentStatusBadge status={agent.status.code} />
        </div>
        {actions ? <div className="col-span-2 min-[768px]:col-span-1 min-[768px]:col-start-3 min-[768px]:row-span-2 min-[768px]:row-start-1 min-[768px]:self-center">{actions}</div> : null}
      </div>

      {agent.skills.length > 0 ? (
        <>
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-display text-xl font-bold text-ink">Навыки</h2>
            <span className="text-sm font-semibold text-ink-60">{agent.skills.length}</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div aria-hidden="true" className={`hidden h-[34px] border-b border-border bg-surface-alt px-5 text-[11px] font-bold tracking-wider text-ink-60 ${COLUMNS}`}>
              <span>НАВЫК</span>
              <span>СТАТУС</span>
              <span>СТАТУС С</span>
            </div>
            <ul>
              {agent.skills.map((skill) => (
                <li key={skill.id} className={`flex flex-col gap-2 border-b border-border px-4 py-3.5 last:border-b-0 min-[768px]:px-5 min-[768px]:py-3 ${COLUMNS}`}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-[15px] font-semibold text-ink">{skill.name}</p>
                    <p className="text-[13px] leading-[1.4] text-ink-60 min-[768px]:text-xs">{skill.description}</p>
                  </div>
                  <div className="flex items-center gap-2.5 min-[768px]:contents">
                    <Badge tone="neutral" className={SKILL_BADGE_CLASS[skill.status]}>
                      {SKILL_STATUS_LABEL[skill.status]}
                    </Badge>
                    <span className="text-xs text-ink-60 min-[768px]:text-[13px]">
                      <span className="min-[768px]:hidden">с </span>
                      {formatDate(skill.statusChangedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-10 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-brand-red-soft text-brand-red">
            <svg {...SVG} className="size-7">
              <path d="M9.9 15.5 8.5 20l-1.4-4.5L2.5 14l4.6-1.5L8.5 8l1.4 4.5L14.5 14z" />
              <path d="M19 3v4M21 5h-4" />
            </svg>
          </span>
          <p className="font-display text-[26px] font-bold text-ink">Навыков пока нет</p>
          <p className="max-w-[420px] text-sm leading-[1.5] text-ink-60">Навыки появятся, когда разработчики примут первые заявки для этого агента</p>
        </div>
      )}
    </div>
  )
}
