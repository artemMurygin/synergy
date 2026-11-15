import { useState, type ReactNode } from 'react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import type { Archive, ProductRef } from '@/lib/schemas'
import { SKILL_BADGE_CLASS, SKILL_STATUS_LABEL } from '@/lib/status-labels'
import { cn } from '@/lib/utils'
import { restoreErrorMessage, useRestoreAgent, useRestoreSkill } from '../model/use-restore'

type ArchivedAgent = Archive['agents'][number]
type ArchivedSkill = Archive['skills'][number]

const AGENT_COLUMNS = 'lg:grid-cols-[minmax(0,1fr)_220px_140px_190px]'
const SKILL_COLUMNS = 'lg:grid-cols-[minmax(0,1fr)_220px_150px_140px_190px]'

const productNames = (products: ProductRef[]) => products.map((p) => p.name).join(', ')

/** "1 навык вернётся", "2 навыка вернутся", "5 навыков вернутся" with Russian plural rules. */
export function skillsBackText(count: number): string {
  if (count === 0) return 'Навыков нет'
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${String(count)} навык вернётся вместе с агентом`
  const few = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
  return `${String(count)} ${few ? 'навыка' : 'навыков'} вернутся вместе с агентом`
}

function Glyph({ children, className = 'size-[18px]' }: { children: ReactNode; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn('shrink-0', className)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

const BotGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
  </Glyph>
)

const SparklesGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M9.9 4.4 11 8.1a2 2 0 0 0 1.3 1.3l3.7 1.1-3.7 1.1a2 2 0 0 0-1.3 1.3L9.9 16.6 8.8 12.9a2 2 0 0 0-1.3-1.3L3.8 10.5l3.7-1.1a2 2 0 0 0 1.3-1.3z" />
    <path d="M19 3v4M21 5h-4M19 17v4M21 19h-4" />
  </Glyph>
)

function IconBox({ children }: { children: ReactNode }) {
  return <span className="hidden size-9 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-60 lg:flex">{children}</span>
}

function RestoreButton({ pending, onClick, label }: { pending: boolean; onClick: () => void; label: string }) {
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={onClick} aria-label={`Восстановить: ${label}`} className="max-lg:h-11 max-lg:w-full lg:w-[178px]">
      <Glyph>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
      </Glyph>
      Восстановить
    </Button>
  )
}

const DATE_CLASS = 'text-[13px] font-medium text-ink-60 max-lg:text-xs max-lg:font-normal'
const ROW_CLASS = 'flex flex-col gap-2 border-b border-border px-4 py-3.5 last:border-b-0 lg:grid lg:items-center lg:gap-4 lg:px-5 lg:py-0 lg:h-[68px]'

function ArchivedDate({ iso }: { iso: string }) {
  return (
    <p className={DATE_CLASS}>
      <span className="lg:hidden">в архиве с </span>
      {formatDate(iso)}
    </p>
  )
}

function ListHead({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
      <span className="text-sm font-semibold text-ink-60">{count}</span>
    </div>
  )
}

function TableHead({ columns, labels }: { columns: string; labels: string[] }) {
  return (
    <div aria-hidden="true" className={cn('hidden h-[34px] items-center gap-4 bg-surface-alt px-5 text-[11px] font-bold uppercase tracking-wide text-ink-60 lg:grid', columns)}>
      {labels.map((label, i) => (
        <span key={label || String(i)}>{label}</span>
      ))}
    </div>
  )
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-surface px-5 py-7 text-center text-ink-40">
      {icon}
      <p className="font-display text-lg font-bold text-ink">{title}</p>
      <p className="max-w-[360px] text-[13px] text-ink-60">{text}</p>
    </div>
  )
}

function AgentRow({ agent }: { agent: ArchivedAgent }) {
  const restore = useRestoreAgent()
  return (
    <li className={cn(ROW_CLASS, AGENT_COLUMNS)}>
      <div className="flex min-w-0 items-center gap-3 max-lg:contents">
        <IconBox>
          <BotGlyph />
        </IconBox>
        <div className="flex min-w-0 flex-col gap-0.5 max-lg:contents">
          <p className="text-[15px] font-semibold leading-[18px] text-ink max-lg:order-1">{agent.name}</p>
          <p className="text-xs text-ink-60 max-lg:order-3 max-lg:text-[13px] max-lg:font-medium max-lg:text-ink-80">{skillsBackText(agent.skillsCount)}</p>
        </div>
      </div>
      <p className="text-[13px] font-medium text-ink-60 max-lg:order-2 max-lg:font-normal">{productNames(agent.products)}</p>
      <div className="max-lg:order-4">
        <ArchivedDate iso={agent.archivedAt} />
      </div>
      <div className="max-lg:order-5">
        <RestoreButton pending={restore.isPending} onClick={() => restore.mutate(agent.id)} label={agent.name} />
        {restore.isError ? <p role="alert" className="mt-1 text-xs text-brand-red">{restoreErrorMessage(restore.error)}</p> : null}
      </div>
    </li>
  )
}

function SkillRow({ skill, failed, onRestore, pending }: { skill: ArchivedSkill; failed: boolean; onRestore: () => void; pending: boolean }) {
  return (
    <li className={cn(ROW_CLASS, SKILL_COLUMNS, failed && 'bg-brand-red-soft')}>
      <div className="flex min-w-0 items-center gap-3">
        <IconBox>
          <SparklesGlyph />
        </IconBox>
        <p className="text-[15px] font-semibold leading-[18px] text-ink">{skill.name}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 max-lg:flex-row max-lg:flex-wrap max-lg:gap-x-1">
        <p className="text-[13px] font-medium text-ink max-lg:font-normal max-lg:text-ink-60">{skill.agent.name}</p>
        <span aria-hidden="true" className="hidden text-[13px] text-ink-60 max-lg:inline">·</span>
        <p className="text-xs text-ink-60 max-lg:text-[13px]">{productNames(skill.products)}</p>
      </div>
      <div className="flex items-center justify-between max-lg:gap-2 lg:contents">
        <div>
          <Badge tone="neutral" className={SKILL_BADGE_CLASS[skill.status]}>
            {SKILL_STATUS_LABEL[skill.status]}
          </Badge>
        </div>
        <ArchivedDate iso={skill.archivedAt} />
      </div>
      <RestoreButton pending={pending} onClick={onRestore} label={skill.name} />
    </li>
  )
}

interface SkillFailure {
  skillId: string
  title: string
  text: string
}

/** The two lists of the archive page; a restored entry disappears when the archive query reloads. */
export function ArchiveLists({ archive }: { archive: Archive }) {
  const restoreSkill = useRestoreSkill()
  const [failure, setFailure] = useState<SkillFailure | null>(null)
  const { agents, skills } = archive

  const onRestoreSkill = (skill: ArchivedSkill) => {
    setFailure(null)
    restoreSkill.mutate(skill.id, {
      onError: (error) => {
        const message = restoreErrorMessage(error)
        const archivedAgent = error.code === 'PORTAL_AGENT_ARCHIVED'
        setFailure({
          skillId: skill.id,
          title: archivedAgent ? message : 'Не удалось восстановить навык',
          text: archivedAgent
            ? `Навык «${skill.name}» относится к агенту «${skill.agent.name}», который в архиве. Восстановите агента в списке выше, затем навык.`
            : message
        })
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Архивные агенты" className="flex flex-col gap-3">
        <ListHead title="Агенты" count={agents.length} />
        {agents.length === 0 ? (
          <EmptyState icon={<BotGlyph className="size-6" />} title="Архивных агентов нет" text="Агент попадает сюда, когда разработчик архивирует его из карточки агента" />
        ) : (
          <div className="overflow-hidden rounded-lg bg-surface">
            <TableHead columns={AGENT_COLUMNS} labels={['Агент', 'Продукт', 'В архиве с', '']} />
            <ul>
              {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
            </ul>
          </div>
        )}
      </section>
      <section aria-label="Архивные навыки" className="flex flex-col gap-3">
        <ListHead title="Навыки" count={skills.length} />
        {failure ? (
          <Alert title={failure.title}>
            <p>{failure.text}</p>
            <button type="button" onClick={() => setFailure(null)} className="mt-1 text-[13px] font-semibold text-brand-red">
              Понятно
            </button>
          </Alert>
        ) : null}
        {skills.length === 0 ? (
          <EmptyState
            icon={<SparklesGlyph className="size-6" />}
            title="Архивных навыков нет"
            text="Навык попадает сюда, когда его архивируют в разделе «Навыки» или вместе с агентом"
          />
        ) : (
          <div className="overflow-hidden rounded-lg bg-surface">
            <TableHead columns={SKILL_COLUMNS} labels={['Навык', 'Агент · продукт', 'Статус', 'В архиве с', '']} />
            <ul>
              {skills.map((skill) => (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  failed={failure?.skillId === skill.id}
                  pending={restoreSkill.isPending && restoreSkill.variables === skill.id}
                  onRestore={() => onRestoreSkill(skill)}
                />
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
