import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from '../icons'
import { displayLink, qrSvg } from './qr'

const COPIED_MS = 2000

function QrCode({ link }: { link: string }) {
  const [rendered, setRendered] = useState<{ link: string; svg: string } | null>(null)
  const svg = rendered?.link === link ? rendered.svg : null
  useEffect(() => {
    let cancelled = false
    qrSvg(link).then(
      (value) => {
        if (!cancelled) setRendered({ link, svg: value })
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [link])
  return (
    <div
      role="img"
      aria-label="QR-код ссылки на бота"
      className="flex size-[104px] shrink-0 items-center justify-center rounded-md bg-surface p-3 [&>svg]:size-full"
      // SVG строит библиотека qrcode из ссылки, внешних данных в нём нет.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  )
}

/** Блок QR и чип со ссылкой (макеты t:se4na, t:R31sI): только для ожидания привязки. */
export function TelegramLinkShare({ link, onCopy }: { link: string; onCopy?: (link: string) => void }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )

  const copy = () => {
    void navigator.clipboard.writeText(link).then(() => {
      onCopy?.(link)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setCopied(false)
      }, COPIED_MS)
    })
  }

  return (
    <div className="flex items-center gap-3.5 rounded-lg bg-surface-alt p-3.5">
      <QrCode link={link} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[13px] font-semibold text-ink">Удобнее с телефона?</p>
        <p className="text-xs text-ink-60">Отсканируйте код камерой — бот откроется в Telegram.</p>
        <div className="flex items-center gap-1.5 rounded-[14px] bg-surface py-1.5 pr-2 pl-2.5">
          <span className="min-w-0 flex-1 truncate text-[10px] text-ink-80">{displayLink(link)}</span>
          <button
            type="button"
            aria-label={copied ? 'Ссылка скопирована' : 'Копировать ссылку'}
            onClick={copy}
            className="flex shrink-0 items-center justify-center text-ink-60 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
