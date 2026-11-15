import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  /** false: Esc, the backdrop and the close button do not close the dialog (temporary password window) */
  dismissible?: boolean
  role?: 'dialog' | 'alertdialog'
  className?: string
  /** Confirm layout (ConfirmDialog / Master): round icon disc on top, no header row and no close button */
  icon?: ReactNode
  /** Sheet spacing below 640px (DepartmentDialog 360): header p[0,8,0,16], body px 16, footer p[16,16,24,16] gap 10, 48px buttons */
  compactSheet?: boolean
  /** Extra classes of the body (the temporary password sheet uses gap 14) */
  bodyClassName?: string
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const FIELDS = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled])'

/* Dialog / Master: 520 wide card, r-xl, header 20/700 with a close button, body, footer with actions on the right.
   Below 640px the card is pinned to the bottom, full width, and the footer buttons stack with the primary one on top. */
export function Dialog({ open, onClose, title, description, children, footer, dismissible = true, role = 'dialog', className, icon, compactSheet, bodyClassName }: DialogProps) {
  const uid = useId()
  const titleId = `${uid}-title`
  const descriptionId = `${uid}-description`
  const cardRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const dismissibleRef = useRef(dismissible)
  dismissibleRef.current = dismissible

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const card = cardRef.current
    if (card) {
      const target = card.querySelector<HTMLElement>('[data-autofocus]') ?? card.querySelector<HTMLElement>(FIELDS) ?? card
      target.focus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (dismissibleRef.current) {
          event.stopPropagation()
          onCloseRef.current()
        }
        return
      }
      if (event.key !== 'Tab' || !cardRef.current) return
      const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === cardRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      } else if (!cardRef.current.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      data-testid="dialog-backdrop"
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose()
      }}
    >
      <div
        ref={cardRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'flex max-h-full w-full flex-col overflow-y-auto rounded-t-xl bg-surface font-sans shadow-[0_12px_32px_rgba(0,0,0,0.16)] focus:outline-none sm:max-w-[520px] sm:rounded-xl',
          icon ? 'gap-4 px-4 py-6 sm:p-6' : undefined,
          className
        )}
      >
        {icon ? (
          <>
            <div data-testid="confirm-icon-disc" className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-brand-red-soft text-brand-red">
              {icon}
            </div>
            <h2 id={titleId} className="font-display text-xl leading-[1.25] font-bold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-sm leading-[1.45] text-ink-60">
                {description}
              </p>
            ) : null}
            {children}
            {footer ? <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">{footer}</div> : null}
          </>
        ) : (
          <>
        <div className={cn('flex min-h-16 items-center gap-2 py-0 pr-4 pl-6', compactSheet && (dismissible ? 'pr-2 pl-4 sm:pr-4 sm:pl-6' : 'px-4 sm:px-6'))}>
          <h2 id={titleId} className="flex-1 font-display text-xl font-bold text-ink">
            {title}
          </h2>
          {dismissible ? (
            <button
              type="button"
              aria-label="Закрыть"
              onClick={onClose}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
        <div className={cn('flex flex-col gap-4 px-6 pb-2', compactSheet && 'px-4 sm:px-6', bodyClassName)}>
          {description ? (
            <p id={descriptionId} className="text-sm text-ink-60">
              {description}
            </p>
          ) : null}
          {children}
        </div>
        {footer ? (
          <div className={cn('flex flex-col-reverse gap-3 px-6 pt-4 pb-6 sm:flex-row sm:items-center sm:justify-end', compactSheet && 'gap-2.5 px-4 sm:gap-3 sm:px-6')}>{footer}</div>
        ) : (
          <div className="pb-4" />
        )}
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
