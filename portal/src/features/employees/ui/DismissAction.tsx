import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LAST_ADMIN_TEXT, LAST_ADMIN_TITLE } from '../model/employee-form-errors'
import type { Employee } from '../model/employees.schema'

export interface DismissActionProps {
  employee: Employee
  /** The administrator looks at their own card: the dialog adds the warning about losing access */
  isSelf?: boolean
  onDismiss: () => Promise<unknown> | void
  onRestore: () => Promise<unknown> | void
  success?: 'dismissed' | 'restored'
  lastAdminError?: boolean
  error?: string
}

const icon = { 'aria-hidden': true, viewBox: '0 0 24 24', className: 'size-[18px]', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/* Card "Доступ": "Уволить" asks first (alertdialog, focus on "Отмена"), "Вернуть" does not. There is no "Удалить". */
export function DismissAction({ employee, isSelf, onDismiss, onRestore, success, lastAdminError, error }: DismissActionProps) {
  const [confirming, setConfirming] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [restoring, setRestoring] = useState(false)

  async function confirm() {
    setDismissing(true)
    try {
      await onDismiss()
    } catch {
      // the page shows the reason; the dialog closes either way
    } finally {
      setDismissing(false)
      setConfirming(false)
    }
  }

  async function restore() {
    setRestoring(true)
    try {
      await onRestore()
    } catch {
      // the page shows the reason
    } finally {
      setRestoring(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold text-ink">Доступ</h2>
      {success === 'dismissed' ? <Alert tone="success">Сотрудник уволен</Alert> : null}
      {success === 'restored' ? <Alert tone="success">Доступ возвращён. Пароль прежний</Alert> : null}
      {employee.isActive ? (
        <>
          <p className="text-sm text-ink-80">Сотрудник может входить в портал</p>
          {lastAdminError ? (
            <Alert tone="error" title={LAST_ADMIN_TITLE}>
              {LAST_ADMIN_TEXT}
            </Alert>
          ) : null}
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button variant="outline" size="sm" className="h-11 w-full self-start text-brand-red sm:w-auto" onClick={() => setConfirming(true)}>
            <svg {...icon}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="m17 8 5 5M22 8l-5 5" />
            </svg>
            Уволить
          </Button>
          <ConfirmDialog
            open={confirming}
            title={`Уволить ${employee.fullName}?`}
            description="Сотрудник потеряет доступ к порталу: войти больше не сможет, текущие сессии будут завершены. Его заявки и данные сохранятся, вернуть доступ можно в любой момент"
            confirmLabel={dismissing ? 'Увольняем…' : 'Уволить'}
            pending={dismissing}
            onCancel={() => setConfirming(false)}
            onConfirm={() => void confirm()}
          >
            {isSelf ? (
              <div role="status" className="flex items-center gap-2.5 rounded-md bg-brand-red-soft px-3.5 py-3 text-[13px] font-semibold text-ink">
                <svg {...icon} className="size-[18px] shrink-0 text-brand-red">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </svg>
                Вы потеряете доступ к порталу
              </div>
            ) : null}
          </ConfirmDialog>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-80">Сотрудник уволен и не может войти. Заявки и данные сохранены</p>
          {lastAdminError ? (
            <Alert tone="error" title={LAST_ADMIN_TITLE}>
              {LAST_ADMIN_TEXT}
            </Alert>
          ) : null}
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button variant="outline" size="sm" className="h-11 w-full self-start sm:w-auto" disabled={restoring} onClick={() => void restore()}>
            <svg {...icon}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="m16 11 2 2 4-4" />
            </svg>
            {restoring ? 'Возвращаем…' : 'Вернуть'}
          </Button>
        </>
      )}
    </section>
  )
}
