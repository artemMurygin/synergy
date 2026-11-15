import { useId, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { Role } from '@/lib/schemas'
import { LAST_ADMIN_TEXT, LAST_ADMIN_TITLE } from '../model/employee-form-errors'
import { ROLE_HINT } from './EmployeeForm'
import { ROLE_LABEL, ROLE_ORDER } from './role-labels'

export interface RolesEditorProps {
  /** The set the server has now */
  roles: Role[]
  onSave: (roles: Role[]) => void
  saved?: boolean
  /** 409 LAST_ADMIN: the boxes return to the server set */
  lastAdminError?: boolean
  error?: string
  pending?: boolean
}

export const ROLES_DELAY_TEXT = 'Изменение вступит в силу не сразу: у сотрудника — после обновления его сессии, в течение нескольких минут'

/* Card "Роли": two checkboxes, the delay hint is always visible, the whole set is saved at once. */
export function RolesEditor({ roles, onSave, saved, lastAdminError, error, pending }: RolesEditorProps) {
  const hintId = useId()
  const serverKey = `${[...roles].sort().join(',')}|${lastAdminError ? '1' : '0'}`
  const [seenKey, setSeenKey] = useState(serverKey)
  const [selected, setSelected] = useState<Role[]>(roles)

  if (seenKey !== serverKey) {
    setSeenKey(serverKey)
    setSelected(roles)
  }

  const ordered = (set: Role[]) => ROLE_ORDER.filter((role) => set.includes(role))
  const changed = ordered(selected).join(',') !== ordered(roles).join(',')

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 sm:p-6">
      <fieldset aria-describedby={hintId} className="flex min-w-0 flex-col gap-3">
        <legend className="mb-1 font-display text-xl font-bold text-ink">Роли</legend>
        <div className="flex flex-col">
          {ROLE_ORDER.map((role) => (
            <Checkbox
              key={role}
              label={ROLE_LABEL[role]}
              description={ROLE_HINT[role]}
              checked={selected.includes(role)}
              onCheckedChange={(on) => setSelected((current) => (on ? [...current, role] : current.filter((item) => item !== role)))}
            />
          ))}
        </div>
        {lastAdminError ? (
          <Alert tone="error" title={LAST_ADMIN_TITLE}>
            {LAST_ADMIN_TEXT}
          </Alert>
        ) : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Alert id={hintId} tone="info" title={ROLES_DELAY_TEXT} />
        {saved ? <Alert tone="success">Роли сохранены</Alert> : null}
        <Button variant="outline" size="sm" className="h-11 w-full self-start rounded-md sm:h-10 sm:w-auto" disabled={pending || !changed} onClick={() => onSave(ordered(selected))}>
          {pending ? 'Сохраняем…' : 'Сохранить роли'}
        </Button>
      </fieldset>
    </section>
  )
}
