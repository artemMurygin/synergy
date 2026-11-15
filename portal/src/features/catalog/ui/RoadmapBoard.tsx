import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { SKILL_BADGE_CLASS, SKILL_STATUS_LABEL } from '@/lib/status-labels'
import type { RoadmapGroup, RoadmapSkill } from '../model/roadmap'

function RoadmapCard({ skill }: { skill: RoadmapSkill }) {
  return (
    <Link
      to={`/catalog/agents/${encodeURIComponent(skill.agent.id)}`}
      className="flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-surface px-3.5 py-3 transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="text-sm font-semibold leading-[1.3] text-ink">{skill.name}</span>
      <span className="flex flex-col gap-0.5 text-xs">
        <span className="font-medium text-ink-80">{skill.agent.name}</span>
        <span className="text-ink-60">{skill.products.map((p) => p.name).join(', ')}</span>
      </span>
    </Link>
  )
}

function EmptyGroup() {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-md border border-border-strong px-3 py-5">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[18px] text-ink-40"
      >
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
      <p className="text-[13px] font-semibold text-ink-60">Здесь пока пусто</p>
    </div>
  )
}

/** Skills in status groups: five columns on desktop, vertical groups (no horizontal scroll) on narrow screens. */
export function RoadmapBoard({ groups }: { groups: RoadmapGroup[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 min-[1024px]:grid-cols-5 min-[1024px]:items-start min-[1024px]:gap-4">
      {groups.map((group) => {
        const headingId = `roadmap-group-${group.status}`
        return (
          <section
            key={group.status}
            aria-labelledby={headingId}
            className="flex min-w-0 flex-col gap-2.5 min-[1024px]:rounded-lg min-[1024px]:bg-surface-sunken min-[1024px]:p-3"
          >
            <div className="flex items-center justify-between gap-2 min-[1024px]:px-0.5 min-[1024px]:pb-1 min-[1024px]:pt-0.5">
              <h2 id={headingId}>
                <Badge
                  tone="neutral"
                  className={cn(SKILL_BADGE_CLASS[group.status], group.status === 'planned' && 'min-[1024px]:bg-surface')}
                >
                  {SKILL_STATUS_LABEL[group.status]}
                </Badge>
              </h2>
              <span className="text-[13px] font-bold text-ink-60">{group.skills.length}</span>
            </div>
            {group.skills.length === 0 ? (
              <EmptyGroup />
            ) : (
              group.skills.map((skill) => <RoadmapCard key={skill.id} skill={skill} />)
            )}
          </section>
        )
      })}
    </div>
  )
}
