import type { ReactNode } from 'react'
import { Button } from './button'
import { Dialog } from './dialog'

const UserXIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="m17 8 5 5M22 8l-5 5" />
  </svg>
)

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
  /** Icon inside the red disc, default user-x as in the master */
  icon?: ReactNode
  /** Extra block under the description (the "Warning" slot of ConfirmDialog / Master) */
  children?: ReactNode
}

/* ConfirmDialog / Master: alertdialog, focus starts on the safe "Отмена" button, the action is the primary button */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Отмена', onConfirm, onCancel, pending, icon, children }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      role="alertdialog"
      icon={icon ?? <UserXIcon />}
      className="sm:max-w-[440px]"
      footer={
        <>
          <Button variant="outline" size="sm" className="h-11 disabled:bg-surface disabled:text-ink disabled:opacity-50" data-autofocus disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button size="sm" className="h-11 disabled:bg-brand-red disabled:text-surface disabled:opacity-60" disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  )
}
