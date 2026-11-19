import { RotateCcw, WifiOff } from '../icons'

export type ConnectionBannerProps = {
  onRetry: () => void
  retrying?: boolean
  /** Extra line for the app (e.g. where to check the address of the server). */
  hint?: string
}

/** The server is unreachable: the history stays visible, sending is blocked. */
export function ConnectionBanner({ onRetry, retrying = false, hint }: ConnectionBannerProps) {
  return (
    <div role="alert" className="flex w-full items-start gap-2.5 rounded-lg bg-warning-soft py-2.5 pr-2.5 pl-3.5">
      <span className="mt-0.5 shrink-0 text-warning">
        <WifiOff size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-chat text-sm font-semibold text-ink">Сервер недоступен</span>
        <span className="font-chat text-[13px] leading-[1.4] text-ink-60">
          Не удалось связаться с сервером. Проверьте подключение и повторите попытку
        </span>
        {hint !== undefined && <span className="font-chat text-[13px] leading-[1.4] text-ink-60">{hint}</span>}
      </div>
      <button
        type="button"
        disabled={retrying}
        onClick={onRetry}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-surface px-3 font-chat text-[13px] font-semibold text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-60"
      >
        <RotateCcw size={14} className={retrying ? 'animate-spin' : undefined} />
        Повторить
      </button>
    </div>
  )
}
