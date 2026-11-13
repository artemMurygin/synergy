import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { restoreSession } from '../auth.api'
import { cn } from '@/lib/utils'

/* Lucide glyphs used by the auth screens (the project has no icon package) */
const GLYPHS = {
  user: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  lock: (
    <>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  'life-buoy': (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.93 4.93 4.24 4.24" />
      <path d="m14.83 9.17 4.24-4.24" />
      <path d="m14.83 14.83 4.24 4.24" />
      <path d="m9.17 14.83-4.24 4.24" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </>
  ),
  'wifi-off': (
    <>
      <path d="M12 20h.01" />
      <path d="M8.5 16.429a5 5 0 0 1 7 0" />
      <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
      <path d="M19 12.859a10 10 0 0 0-2.007-1.523" />
      <path d="M2 8.82a15 15 0 0 1 4.177-2.643" />
      <path d="M22 8.82a15 15 0 0 0-11.288-3.764" />
      <path d="m2 2 20 20" />
    </>
  ),
  'refresh-cw': (
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </>
  ),
  loader: (
    <>
      <path d="M12 2v4" />
      <path d="m16.2 7.8 2.9-2.9" />
      <path d="M18 12h4" />
      <path d="m16.2 16.2 2.9 2.9" />
      <path d="M12 18v4" />
      <path d="m4.9 19.1 2.9-2.9" />
      <path d="M2 12h4" />
      <path d="m4.9 4.9 2.9 2.9" />
    </>
  ),
  'circle-check': (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  circle: <circle cx="12" cy="12" r="10" />
} satisfies Record<string, ReactNode>

export type GlyphName = keyof typeof GLYPHS

export function Glyph({ name, size = 18, className }: { name: GlyphName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name]}
    </svg>
  )
}

type IconFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string
  icon: GlyphName
  error?: string
  /** red border without error text (the notice above the form already explains it) */
  invalid?: boolean
  /** show the eye toggle for password fields */
  reveal?: boolean
}

/** Field / Master: 52px box with a leading icon, optional eye toggle; label above, error text below. */
export function IconField({ label, icon, error, invalid, reveal, type, className, ...props }: IconFieldProps) {
  const [shown, setShown] = useState(false)
  const isInvalid = Boolean(error) || invalid === true
  const inputId = useId()
  const errorId = error ? `${inputId}-error` : undefined
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      <div
        className={cn(
          'flex h-[52px] items-center gap-2.5 rounded-md border bg-surface px-[15px] transition-colors focus-within:border-ink focus-within:ring-[0.5px] focus-within:ring-ink',
          'border-border-strong',
          isInvalid && 'border-brand-red',
          className
        )}
      >
        <Glyph name={icon} className="text-ink-40" />
        <input
          id={inputId}
          type={reveal && shown ? 'text' : type}
          aria-invalid={isInvalid ? true : undefined}
          aria-describedby={errorId}
          className="min-w-0 flex-1 bg-transparent font-sans text-[15px] text-ink outline-none placeholder:text-ink-40"
          {...props}
        />
        {reveal ? (
          <button
            type="button"
            aria-label={shown ? 'Скрыть пароль' : 'Показать пароль'}
            aria-pressed={shown}
            onClick={() => setShown((v) => !v)}
            className="flex text-ink-60 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Glyph name={shown ? 'eye-off' : 'eye'} />
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="flex items-center gap-1.5 text-brand-red">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <p id={errorId} className="text-[12px]">
            {error}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/** Centered card on the grey page: the frame used by change-password, restoring and unavailable screens. */
export function CardScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className="flex min-h-full items-center justify-center bg-surface-alt p-8">
      <div className={cn('flex w-full max-w-[486px] flex-col rounded-lg border border-border bg-surface p-[31px]', className)}>
        {children}
      </div>
    </main>
  )
}

export function CardHead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-[24px] font-bold leading-[31px] tracking-[-0.4px] text-ink">{title}</h1>
      <p className="text-[14px] leading-5 text-ink-60">{children}</p>
    </div>
  )
}

function IconCircle({ tone, children }: { tone: 'red' | 'neutral'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex size-14 items-center justify-center rounded-pill',
        tone === 'red' ? 'bg-brand-red-soft text-brand-red' : 'bg-surface-sunken text-ink-80'
      )}
    >
      {children}
    </div>
  )
}

/** "Восстановление сессии" screen */
export function SessionRestoringView() {
  return (
    <CardScreen className="gap-5">
      <IconCircle tone="neutral">
        <Glyph name="loader" size={26} />
      </IconCircle>
      <CardHead title="Открываем портал">Проверяем вход по сохранённой сессии…</CardHead>
      <div role="status" aria-label="Восстанавливаем сессию" className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunken">
        <div className="h-1.5 w-[180px] rounded-pill bg-brand-red motion-safe:animate-pulse" />
      </div>
      <p className="text-[12px] leading-[1.4] text-ink-40">Обычно это занимает пару секунд. Если сессия истекла, откроется экран входа.</p>
    </CardScreen>
  )
}

/** "Сервер недоступен" screen */
export function ServerUnavailableView() {
  return (
    <CardScreen className="gap-5">
      <IconCircle tone="red">
        <Glyph name="wifi-off" size={26} />
      </IconCircle>
      <div role="alert">
        <CardHead title="Сервер недоступен">Не получается связаться с порталом. Проверьте интернет или VPN и попробуйте ещё раз.</CardHead>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => void restoreSession()}>
          <Glyph name="refresh-cw" size={18} />
          Повторить
        </Button>
      </div>
      <p className="text-[12px] leading-[1.4] text-ink-40">Если ошибка не уходит, сообщите администратору код NETWORK_ERROR.</p>
    </CardScreen>
  )
}
