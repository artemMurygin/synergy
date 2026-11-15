import type * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ProductRef } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { SKILL_STATUS_LABEL } from '@/lib/status-labels'
import { agentsQuery } from '../model/catalog.queries'
import { skillsQuery } from '../model/skills.queries'
import { ProductMultiSelect } from './ProductMultiSelect'

export type SkillPickerValue =
  | { mode: 'existing'; skillId: string }
  | { mode: 'new'; agentId: string; name: string; description: string }
  | { mode: 'new_agent'; agentName: string; productIds: string[]; newProductName: string; name: string; description: string }

export type SkillPickerErrors = Partial<
  Record<'skillId' | 'agentId' | 'name' | 'description' | 'agentName' | 'products' | 'newProduct', string>
>

export interface SkillPickerProps {
  value: SkillPickerValue
  onChange: (value: SkillPickerValue) => void
  errors?: SkillPickerErrors
  /** Products of the catalog for the "new agent" mode (the page passes them: features do not import each other). */
  products?: ProductRef[]
}

/* Chip / Master at height 36: pill, 1px border-strong, 14/500; active chip is filled with ink */
function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 min-w-0 flex-1 basis-0 items-center justify-center whitespace-nowrap rounded-pill border px-2 font-sans text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active ? 'border-ink bg-ink text-surface' : 'border-border-strong bg-surface text-ink hover:bg-surface-alt'
      )}
    >
      {children}
    </button>
  )
}

/* lucide icons in ink-40 (#A8A9AC), as the leading icon of Field / Master */
function leadingIcon(path: string) {
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23A8A9AC' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E${path}%3C/svg%3E")`
}
const CHEVRON_ICON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237E7F81' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`
const SEARCH_ICON = leadingIcon("%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E")
const BOT_ICON = leadingIcon(
  "%3Cpath d='M12 8V4H8'/%3E%3Crect width='16' height='12' x='4' y='8' rx='2'/%3E%3Cpath d='M2 14h2'/%3E%3Cpath d='M20 14h2'/%3E%3Cpath d='M15 13v2'/%3E%3Cpath d='M9 13v2'/%3E"
)

function selectIconStyle(icon: string): React.CSSProperties {
  return {
    backgroundImage: `${icon}, ${CHEVRON_ICON}`,
    backgroundPosition: 'left 16px center, right 16px center',
    backgroundSize: '18px 18px, 18px 18px'
  }
}

/* Group · Агент / Навык: surface-alt card, r-md, 16 padding, 14 gap; title 11/700 ink-60 */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3.5 rounded-md border-0 bg-surface-alt p-4">
      <legend className="mb-3.5 p-0 font-sans text-[11px] font-bold leading-[1.17] tracking-[0.6px] text-ink-60">{title}</legend>
      {children}
    </fieldset>
  )
}

export function SkillPicker({ value, onChange, errors = {}, products = [] }: SkillPickerProps) {
  const skills = useQuery({ ...skillsQuery(undefined, 0), enabled: value.mode === 'existing' })
  const agents = useQuery({ ...agentsQuery(), enabled: value.mode === 'new' })
  const skill = value.mode === 'existing' ? skills.data?.items.find((s) => s.id === value.skillId) : undefined
  const agent = value.mode === 'new' ? agents.data?.find((a) => a.id === value.agentId) : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
        <ModeButton active={value.mode === 'existing'} onClick={() => onChange({ mode: 'existing', skillId: '' })}>
          Существующий
        </ModeButton>
        <ModeButton
          active={value.mode === 'new'}
          onClick={() => onChange({ mode: 'new', agentId: '', name: '', description: '' })}
        >
          Новый навык
        </ModeButton>
        <ModeButton
          active={value.mode === 'new_agent'}
          onClick={() =>
            onChange({ mode: 'new_agent', agentName: '', productIds: [], newProductName: '', name: '', description: '' })
          }
        >
          Новый агент
        </ModeButton>
      </div>

      {value.mode === 'existing' ? (
        <Select
          label="Навык"
          className="pl-11"
          style={selectIconStyle(SEARCH_ICON)}
          value={value.skillId}
          error={errors.skillId ?? (skills.isError ? 'Не удалось загрузить навыки' : undefined)}
          onChange={(e) => onChange({ mode: 'existing', skillId: e.target.value })}
        >
          <option value="">{skills.isPending ? 'Загружаем…' : 'Выберите навык'}</option>
          {skills.data?.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.agent.name}
            </option>
          ))}
        </Select>
      ) : value.mode === 'new_agent' ? (
        <>
          <Group title="Новый агент">
            <Input
              label="Название агента"
              value={value.agentName}
              error={errors.agentName}
              onChange={(e) => onChange({ ...value, agentName: e.target.value })}
            />
            <ProductMultiSelect
              products={products}
              value={value.productIds}
              error={errors.products}
              onChange={(productIds) => onChange({ ...value, productIds })}
            />
            <Input
              label="Новый продукт"
              hint="необязательно"
              hintClassName="text-ink-60"
              value={value.newProductName}
              error={errors.newProduct}
              onChange={(e) => onChange({ ...value, newProductName: e.target.value })}
            />
          </Group>
          <Group title="Навык">
            <Input
              label="Название навыка"
              value={value.name}
              error={errors.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
            />
            <Textarea
              label="Что делает"
              hint="увидят авторы"
              hintClassName="text-ink-60"
              className="h-24 min-h-24 resize-none text-sm"
              value={value.description}
              error={errors.description}
              onChange={(e) => onChange({ ...value, description: e.target.value })}
            />
          </Group>
        </>
      ) : (
        <>
          <Select
            label="Агент"
            className="pl-11"
            style={selectIconStyle(BOT_ICON)}
            value={value.agentId}
            error={errors.agentId ?? (agents.isError ? 'Не удалось загрузить агентов' : undefined)}
            hint={agent ? `Продукты: ${agent.products.map((p) => p.name).join(', ')}` : undefined}
            onChange={(e) => onChange({ ...value, agentId: e.target.value })}
          >
            <option value="">{agents.isPending ? 'Загружаем…' : 'Выберите агента'}</option>
            {agents.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Input
            label="Название навыка"
            value={value.name}
            error={errors.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
          <Textarea
            label="Что делает"
            hint="увидят авторы"
            className="h-24 min-h-24 resize-none text-sm"
            value={value.description}
            error={errors.description}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
          />
        </>
      )}

      {skill ? (
        <div className="flex items-center gap-2.5 rounded-md bg-surface-alt px-3.5 py-3 font-sans text-[13px] text-ink-80">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4 shrink-0 text-ink-60"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m16 3 4 4-4 4" />
            <path d="M20 7H4" />
            <path d="m8 21-4-4 4-4" />
            <path d="M4 17h16" />
          </svg>
          <p>Автор увидит статус навыка — «{SKILL_STATUS_LABEL[skill.status]}»</p>
        </div>
      ) : null}
    </div>
  )
}
