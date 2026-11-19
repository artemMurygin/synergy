import { CircleAlert, Send, X } from '../icons'

export function TelegramHeader({ subtitle, onClose }: { subtitle: string; onClose?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
        <Send />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-lg leading-[23px] font-semibold text-ink">Telegram</h2>
        <p className="text-xs text-ink-60">{subtitle}</p>
      </div>
      {onClose ? (
        <button
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
          className="flex size-9 items-center justify-center rounded-full bg-surface-alt text-ink-80 outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-brand-red/40"
        >
          <X size={16} />
        </button>
      ) : null}
    </div>
  )
}

export function TelegramAlert({ title, children }: { title: string; children: string }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-brand-red-soft px-3.5 py-3">
      <CircleAlert className="mt-px shrink-0 text-brand-red" />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-[13px] text-ink-80">{children}</p>
      </div>
    </div>
  )
}
