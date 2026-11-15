import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useArchiveSkill } from '../model/use-archive-skill'

const icon = { 'aria-hidden': true, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function ArchiveIcon({ className }: { className: string }) {
  return (
    <svg {...icon} className={className}>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  )
}

/** Square outline icon button (36 px, 44 px on mobile) that archives a skill after a confirmation. */
export function ArchiveSkillAction({ skillId, skillName }: { skillId: string; skillName: string }) {
  const [open, setOpen] = useState(false)
  const archive = useArchiveSkill()
  const label = `Архивировать навык «${skillName}»`

  function close() {
    setOpen(false)
    archive.reset()
  }

  return (
    <>
      <Button variant="outline" size="sm" className="size-11 shrink-0 px-0 sm:size-9" aria-label={label} title={label} onClick={() => setOpen(true)}>
        <ArchiveIcon className="size-[18px]" />
      </Button>
      <ConfirmDialog
        open={open}
        title={`Архивировать навык «${skillName}»?`}
        description="Навык скроется из списка навыков, каталога и роадмапа. Привязанные заявки сохранятся. Вернуть навык можно в разделе «Архив»"
        confirmLabel={archive.isPending ? 'Архивируем…' : 'Архивировать'}
        pending={archive.isPending}
        icon={<ArchiveIcon className="size-[22px]" />}
        onCancel={close}
        onConfirm={() => archive.mutate(skillId, { onSuccess: () => setOpen(false) })}
      >
        {archive.isError ? <Alert>{archive.error.message}</Alert> : null}
      </ConfirmDialog>
    </>
  )
}
