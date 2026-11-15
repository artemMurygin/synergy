import { useEffect, useRef, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface TemporaryPasswordDialogProps {
  login: string
  password: string
  onClose: () => void
}

type CopyState = 'idle' | 'copied' | 'failed'

export const COPIED_RESET_MS = 2000

const icon = { 'aria-hidden': true, viewBox: '0 0 24 24', className: 'size-4', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/* The one-time window with the temporary password: no cross, Esc and the backdrop do not close it, the browser asks
   before leaving while it is open, and after "Готово" the password is dropped from this component. */
export function TemporaryPasswordDialog({ login, password, onClose }: TemporaryPasswordDialogProps) {
  const [closed, setClosed] = useState(false)
  const [copy, setCopy] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (closed) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [closed])

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    []
  )

  async function copyPassword() {
    if (timer.current !== null) clearTimeout(timer.current)
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(password)
      setCopy('copied')
      timer.current = setTimeout(() => {
        timer.current = null
        setCopy('idle')
      }, COPIED_RESET_MS)
    } catch {
      setCopy('failed')
    }
  }

  if (closed) return null

  const copied = copy === 'copied'
  return (
    <Dialog
      open
      dismissible={false}
      compactSheet
      bodyClassName="gap-3.5 sm:gap-4"
      role="alertdialog"
      onClose={() => undefined}
      title="Сотрудник создан"
      description="Передайте сотруднику логин и временный пароль. При первом входе портал попросит сменить пароль"
      footer={
        <Button
          className="h-11 w-full"
          size="sm"
          onClick={() => {
            setClosed(true)
            onClose()
          }}
        >
          Готово, пароль сохранён
        </Button>
      }
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-ink-60">Логин</span>
        <span className="break-all font-mono text-[15px] font-medium text-ink">{login}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink-60">Временный пароль</span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className={cn('flex min-h-12 min-w-0 flex-1 items-center rounded-md px-3', copy === 'failed' ? 'border border-info bg-info-soft' : 'bg-surface-sunken')}>
            <span className="select-all break-all font-mono text-lg font-semibold text-ink">{password}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            data-autofocus
            className={cn('h-11 w-full sm:w-auto', copied && 'border-success text-success')}
            onClick={() => void copyPassword()}
          >
            {copied ? (
              <svg {...icon}>
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg {...icon}>
                <rect width="14" height="14" x="8" y="8" rx="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
            )}
            {copied ? 'Скопировано' : 'Скопировать'}
          </Button>
        </div>
        {copy === 'failed' ? <p className="text-xs text-brand-red">Не удалось скопировать. Выделите пароль и скопируйте вручную</p> : null}
        <span aria-live="polite" className="sr-only">
          {copied ? 'Скопировано' : ''}
        </span>
      </div>
      <Alert tone="info" title="Пароль показывается один раз. После закрытия окна его нельзя будет посмотреть снова" />
    </Dialog>
  )
}
