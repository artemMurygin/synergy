import { Link } from 'react-router'
import type { CatalogAgent, ProductRef } from '@/lib/schemas'
import { AgentStatusBadge } from './AgentStatusBadge'
import { skillsCount } from './plural'

const SVG = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

/** AgentTile / Master: icon + status, name, "also in" line, skills count and chevron. `product` is the section the tile sits in. */
export function AgentTile({ agent, product }: { agent: CatalogAgent; product?: ProductRef }) {
  const others = agent.products.filter((p) => p.id !== product?.id)
  return (
    <Link
      to={`/catalog/agents/${encodeURIComponent(agent.id)}`}
      className="flex h-full min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex size-10 items-center justify-center rounded-md bg-surface-sunken text-ink-80">
          <svg {...SVG} className="size-5">
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
          </svg>
        </span>
        <AgentStatusBadge status={agent.status.code} />
      </div>
      <p className="font-display text-lg font-bold leading-tight text-ink">{agent.name}</p>
      {others.length > 0 ? (
        <p className="text-xs leading-[1.35] text-ink-60">Также в: {others.map((p) => p.name).join(', ')}</p>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-60">
          <svg {...SVG} className="size-3.5 text-ink-40">
            <path d="M9.9 15.5 8.5 20l-1.4-4.5L2.5 14l4.6-1.5L8.5 8l1.4 4.5L14.5 14z" />
            <path d="M19 3v4" />
            <path d="M21 5h-4" />
          </svg>
          {skillsCount(agent.skills.length)}
        </span>
        <svg {...SVG} className="size-[18px] text-ink-40">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>
    </Link>
  )
}
