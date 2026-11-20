import { Toast as ToastPrimitive } from 'radix-ui'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, X } from '../icons'
import { cn } from '../lib/cn'

export const MAX_TOASTS = 3
export const SUCCESS_TOAST_MS = 4000

export type ToastOptions = {
  tone: 'success' | 'error'
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  persistent?: boolean
}

type ToastEntry = ToastOptions & { id: string }

export type ToastApi = {
  show: (options: ToastOptions) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside ToastProvider')
  return api
}

export function ToastProvider({ children, closeLabel = 'Закрыть' }: { children: ReactNode; closeLabel?: string }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((options: ToastOptions) => {
    counter.current += 1
    const id = `toast-${String(counter.current)}`
    setToasts((list) => [...list, { ...options, id }].slice(-MAX_TOASTS))
    return id
  }, [])

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider swipeDirection="down" label="Уведомления">
        {children}
        {toasts.map((t) => {
          const isError = t.tone === 'error'
          return (
            <ToastPrimitive.Root
              key={t.id}
              data-tone={t.tone}
              aria-live={isError ? 'assertive' : 'polite'}
              type={isError ? 'foreground' : 'background'}
              duration={t.persistent ? Number.POSITIVE_INFINITY : SUCCESS_TOAST_MS}
              onOpenChange={(open) => {
                if (!open) dismiss(t.id)
              }}
              className={cn(
                'flex min-h-11 max-w-[calc(100vw-32px)] items-center gap-2.5 rounded-[22px] bg-ink py-2 pr-2 pl-[18px] text-[13px] text-surface shadow-panel',
              )}
            >
              {isError ? <CircleAlert className="shrink-0" /> : <CircleCheck className="shrink-0" />}
              <div className="flex min-w-0 flex-1 flex-col">
                <ToastPrimitive.Title className="font-medium">{t.title}</ToastPrimitive.Title>
                {t.description ? (
                  <ToastPrimitive.Description className="text-surface/80">{t.description}</ToastPrimitive.Description>
                ) : null}
              </div>
              {t.action ? (
                <button
                  type="button"
                  onClick={t.action.onClick}
                  className="h-8 shrink-0 rounded-full px-3 font-semibold text-surface outline-none hover:bg-surface/15 focus-visible:ring-2 focus-visible:ring-surface/60"
                >
                  {t.action.label}
                </button>
              ) : null}
              {t.persistent ? (
                <ToastPrimitive.Close
                  aria-label={closeLabel}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-surface/80 outline-none hover:bg-surface/15 focus-visible:ring-2 focus-visible:ring-surface/60"
                >
                  <X />
                </ToastPrimitive.Close>
              ) : null}
            </ToastPrimitive.Root>
          )
        })}
        <ToastPrimitive.Viewport className="fixed inset-x-0 bottom-4 z-[60] m-0 flex list-none flex-col items-center gap-2 p-0 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}
