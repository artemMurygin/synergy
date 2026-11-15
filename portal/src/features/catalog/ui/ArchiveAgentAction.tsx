import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useSessionStore } from '@/features/auth'
import type { ProductRef } from '@/lib/schemas'
import { useArchiveAgent } from '../model/use-archive-agent'
import { withSkills } from './plural'

const SVG = { 'aria-hidden': true, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function ArchiveIcon({ className }: { className: string }) {
  return (
    <svg {...SVG} className={className}>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  )
}

function joinNames(products: ProductRef[]): string {
  const names = products.map((p) => p.name)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}` : (names[0] ?? '')
}

export interface ArchiveAgentActionProps {
  agentId: string
  agentName: string
  products: ProductRef[]
  skillsCount: number
  onArchived: () => void
}

/** "Архивировать агента" (developer only): confirmation naming every product, then onArchived. */
export function ArchiveAgentAction({ agentId, agentName, products, skillsCount, onArchived }: ArchiveAgentActionProps) {
  const isDeveloper = useSessionStore((s) => s.profile?.roles.includes('developer') ?? false)
  const [open, setOpen] = useState(false)
  const archive = useArchiveAgent()
  if (!isDeveloper) return null

  const where = products.length > 1 ? `из всех своих продуктов — ${joinNames(products)} —` : `из ${joinNames(products)}`

  function close() {
    setOpen(false)
    archive.reset()
  }

  return (
    <>
      <Button variant="outline" className="h-11 w-full text-brand-red min-[768px]:w-auto" onClick={() => setOpen(true)}>
        <ArchiveIcon className="size-[18px]" />
        Архивировать агента
      </Button>
      <ConfirmDialog
        open={open}
        title={`Архивировать агента «${agentName}»?`}
        description={`Агент скроется ${where} вместе с ${withSkills(skillsCount)}. Заявки сохранятся. Вернуть агента можно в разделе «Архив»`}
        confirmLabel={archive.isPending ? 'Архивируем…' : 'Архивировать'}
        pending={archive.isPending}
        icon={<ArchiveIcon className="size-[22px]" />}
        onCancel={close}
        onConfirm={() => archive.mutate(agentId, { onSuccess: () => { setOpen(false); onArchived() } })}
      >
        {archive.isError ? <Alert>{archive.error.message}</Alert> : null}
      </ConfirmDialog>
    </>
  )
}
