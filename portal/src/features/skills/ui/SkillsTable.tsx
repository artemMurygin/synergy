import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ApiError } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { type Skill, type SkillStatus } from '@/lib/schemas'
import { SKILL_STATUS_LABEL } from '@/lib/status-labels'
import { cn } from '@/lib/utils'
import { agentsQuery } from '../model/catalog.queries'
import { skillErrorMessage } from '../model/use-change-skill-status'
import { ArchiveSkillAction } from './ArchiveSkillAction'
import { SkillAction, SkillStatusBadge, useSkillStatus } from './SkillStatusAction'

export interface SkillCounts {
  total: number
  byStatus: Record<SkillStatus, number>
}

export interface SkillsTableProps {
  items: Skill[]
  filter: SkillStatus | undefined
  onFilterChange: (filter: SkillStatus | undefined) => void
  /** Numbers for the status chips; omitted until they are known. */
  counts?: SkillCounts
  /** Free-text search over skill and agent names, applied on the client. */
  search?: string
  /** Product id to show, or undefined for all products. */
  product?: string | undefined
  onProductChange?: (product: string | undefined) => void
  /** Resets the status, search and product filters together. */
  onReset?: () => void
}

const chipClass =
  'inline-flex h-9 items-center whitespace-nowrap rounded-pill border px-[17px] font-sans text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

function Icon({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

/* Order of the chips and tiles in the design: "Доработка" sits between "Тестируется" and "Запущено" */
const STATUS_ORDER: SkillStatus[] = ['planned', 'in_dev', 'testing', 'rework', 'launched']

const TILES: { status: SkillStatus; label: string; note: string; value: string }[] = [
  { status: 'planned', label: 'Запланировано', note: 'ждут старта', value: 'text-ink-80' },
  { status: 'in_dev', label: 'В разработке', note: 'в работе у команды', value: 'text-info' },
  { status: 'testing', label: 'Тестируется', note: 'проверяем с авторами', value: 'text-ink' },
  { status: 'rework', label: 'Доработка', note: 'вернули после проверки', value: 'text-ink-80' },
  { status: 'launched', label: 'Запущено', note: 'уже работают', value: 'text-success' }
]

function SummaryTiles({ counts }: { counts: SkillCounts }) {
  return (
    <ul aria-label="Сводка по статусам" className="grid grid-cols-2 gap-4 min-[900px]:grid-cols-5">
      {TILES.map((tile) => (
        <li key={tile.status} className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-[19px]">
          <span className={`font-display text-[32px] font-medium leading-none tracking-[-1.4px] ${tile.value}`}>{counts.byStatus[tile.status]}</span>
          <span className="text-sm font-semibold leading-4 text-ink">{tile.label}</span>
          <span className="text-xs leading-[17px] text-ink-60">{tile.note}</span>
        </li>
      ))}
    </ul>
  )
}

interface Notice {
  skillId: string
  title: string
  text: string
  conflict: boolean
}

function SkillRow({
  skill,
  products,
  highlighted,
  onError
}: {
  skill: Skill
  products: string
  highlighted: boolean
  onError: (skill: Skill, error: ApiError) => void
}) {
  const state = useSkillStatus(skill)
  const launched = state.status === 'launched'
  return (
    <TableRow className={cn('h-[72px]', highlighted && 'bg-brand-red-soft hover:bg-brand-red-soft')}>
      <TableCell className="py-0 pr-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', launched ? 'bg-success-soft text-success' : 'bg-surface-sunken text-ink-80')}
          >
            <Icon className="size-[18px]">
              <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
              <path d="M20 2v4" />
              <path d="M22 4h-4" />
              <circle cx="4" cy="20" r="2" />
            </Icon>
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[15px] font-semibold leading-[18px] text-ink">{skill.name}</span>
            <span className="truncate text-xs leading-[14px] text-ink-60">{skill.description}</span>
          </span>
        </div>
      </TableCell>
      <TableCell className="px-0 py-0 pr-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium leading-[15px] text-ink">{skill.agent.name}</span>
          <span className="text-xs leading-[14px] text-ink-60">{products}</span>
        </div>
      </TableCell>
      <TableCell className="px-0 py-0 pr-4">
        <SkillStatusBadge status={state.status} />
      </TableCell>
      <TableCell className="px-0 py-0 pr-4">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold leading-4 text-ink">
          <Icon className="size-3.5 text-ink-40">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            <path d="M10 9H8" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
          </Icon>
          {skill.requestsCount}
        </span>
      </TableCell>
      <TableCell className="px-0 py-0 pr-4 text-[13px] leading-[15px] text-ink-60">{formatDate(skill.statusChangedAt)}</TableCell>
      <TableCell className="px-0 py-0 pr-5 text-right">
        <div className="flex justify-end">
          <div className="flex items-center gap-2">
            <SkillAction skill={skill} state={state} onError={(error) => onError(skill, error)} />
            <ArchiveSkillAction skillId={skill.id} skillName={skill.name} />
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function SkillsTable({ items, filter, onFilterChange, counts, search = '', product, onProductChange, onReset }: SkillsTableProps) {
  const agents = useQuery(agentsQuery())
  const [notice, setNotice] = useState<Notice | null>(null)
  const productsOf = (skill: Skill) => agents.data?.find((a) => a.id === skill.agent.id)?.products ?? skill.products
  const products = [...new Map([...(agents.data ?? []).flatMap((a) => a.products), ...items.flatMap((s) => s.products)].map((p) => [p.id, p.name])).entries()]

  const query = search.trim().toLowerCase()
  const visible = items.filter((skill) => {
    if (product && !productsOf(skill).some((p) => p.id === product)) return false
    return !query || skill.name.toLowerCase().includes(query) || skill.agent.name.toLowerCase().includes(query)
  })

  const chips: { value: SkillStatus | undefined; label: string; count: number | undefined }[] = [
    { value: undefined, label: 'Все', count: counts?.total },
    ...STATUS_ORDER.map((s) => ({ value: s, label: SKILL_STATUS_LABEL[s], count: counts?.byStatus[s] }))
  ]

  const onError = (skill: Skill, error: ApiError) => {
    const conflict = error.kind === 'conflict'
    setNotice({
      skillId: skill.id,
      conflict,
      title: conflict ? 'Статус уже изменили' : 'Не удалось изменить статус',
      text: conflict ? `${skillErrorMessage(error)} Проверьте и повторите действие.` : skillErrorMessage(error)
    })
  }

  const emptyText = [
    filter ? `в статусе «${SKILL_STATUS_LABEL[filter]}»` : null,
    query ? `по запросу «${search.trim()}»` : null
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex flex-col gap-6">
      {counts && !notice && !filter && !query && !product ? <SummaryTiles counts={counts} /> : null}
      {notice ? (
        <Alert title={notice.title}>
          <p>{notice.text}</p>
          <button
            type="button"
            className="mt-1 block text-[13px] font-semibold leading-[15px] text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setNotice(null)}
          >
            Понятно
          </button>
        </Alert>
      ) : null}

      <div className="relative overflow-hidden rounded-lg bg-surface after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:border after:border-border">
        <div role="group" aria-label="Статус навыка" className="flex flex-wrap items-center gap-2 px-5 py-3.5">
          {chips.map((chip) => {
            const active = filter === chip.value
            return (
              <button
                key={chip.value ?? 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => onFilterChange(chip.value)}
                className={cn(chipClass, active ? 'border-ink bg-ink text-white' : 'border-border-strong bg-surface text-ink hover:bg-surface-alt')}
              >
                {chip.count === undefined ? chip.label : `${chip.label} · ${String(chip.count)}`}
              </button>
            )
          })}
          <div className="relative ml-auto">
            <select
              aria-label="Продукт"
              value={product ?? ''}
              onChange={(e) => onProductChange?.(e.target.value || undefined)}
              className={cn(chipClass, 'appearance-none border-border-strong bg-surface pr-[40px] text-ink')}
            >
              <option value="">Все продукты</option>
              {products.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <Icon className="pointer-events-none absolute right-[17px] top-1/2 size-3.5 -translate-y-1/2 text-ink-60">
              <path d="m6 9 6 6 6-6" />
            </Icon>
          </div>
        </div>

        <Table className="min-w-[1234px] table-fixed">
          <colgroup>
            <col />
            <col className="w-[216px]" />
            <col className="w-[166px]" />
            <col className="w-[96px]" />
            <col className="w-[116px]" />
            <col className="w-[340px]" />
          </colgroup>
          <TableHeader className="border-t border-border">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-[34px] py-0 pr-4 leading-[13px]">Навык</TableHead>
              <TableHead className="h-[34px] px-0 py-0 pr-4">Агент · продукт</TableHead>
              <TableHead className="h-[34px] px-0 py-0 pr-4">Статус</TableHead>
              <TableHead className="h-[34px] px-0 py-0 pr-4">Заявок</TableHead>
              <TableHead className="h-[34px] px-0 py-0 pr-4">Изменён</TableHead>
              <TableHead className="h-[34px] px-0 py-0 pr-5">
                <span className="sr-only">Действие</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          {visible.length > 0 ? (
            <TableBody>
              {visible.map((skill) => (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  products={productsOf(skill).map((p) => p.name).join(', ') || '—'}
                  highlighted={notice?.conflict === true && notice.skillId === skill.id}
                  onError={onError}
                />
              ))}
            </TableBody>
          ) : null}
        </Table>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center px-5 pb-12 pt-12">
            <Icon className="size-7 text-ink-40">
              <path d="m13.5 8.5-5 5" />
              <path d="m8.5 8.5 5 5" />
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </Icon>
            <p className="mt-3 font-display text-xl font-semibold leading-[26px] text-ink">Ничего не нашлось</p>
            <p className="mt-3 text-sm leading-4 text-ink-60">{emptyText ? `Нет навыков ${emptyText}.` : 'Нет навыков с таким статусом.'}</p>
            {onReset ? (
              <Button variant="outline" className="mt-3 h-10" onClick={onReset}>
                <Icon className="size-[18px]">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </Icon>
                Сбросить фильтры
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
