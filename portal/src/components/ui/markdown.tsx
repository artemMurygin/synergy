import type { ComponentProps } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

/* Фрейм wGn7t: текст 15/24 ink-80, H2 20/700, H3 16/700 (font-display), код font-mono 13, таблица и цитата по токенам */
const SAFE_PROTOCOL = /^(https?|mailto):/i

/* Пропускаем только http, https, mailto и относительные адреса; остальное (javascript:, data:, file: ...) отбрасываем */
export function safeUrl(url: string): string {
  const value = url.trim()
  if (value === '') return ''
  if (SAFE_PROTOCOL.test(value)) return value
  const colon = value.indexOf(':')
  const boundary = value.search(/[/?#]/)
  const isRelative = colon === -1 || (boundary !== -1 && boundary < colon)
  return isRelative ? value : ''
}

function ExternalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 14 14" className="inline-block size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10 10 4M5 4h5v5" />
    </svg>
  )
}

function Anchor({ href, children }: ComponentProps<'a'>) {
  if (!href) return <span>{children}</span>
  const external = /^https?:/i.test(href)
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 font-semibold text-brand-red hover:underline"
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
      {external ? <ExternalIcon /> : null}
    </a>
  )
}

const components: Components = {
  h1: ({ children }) => <h1 className="font-display text-2xl font-bold text-ink">{children}</h1>,
  h2: ({ children }) => <h2 className="font-display text-xl font-bold text-ink">{children}</h2>,
  h3: ({ children }) => <h3 className="font-display text-base font-bold text-ink">{children}</h3>,
  h4: ({ children }) => <h4 className="font-display text-base font-bold text-ink">{children}</h4>,
  h5: ({ children }) => <h5 className="font-display text-base font-bold text-ink">{children}</h5>,
  h6: ({ children }) => <h6 className="font-display text-base font-bold text-ink">{children}</h6>,
  p: ({ children }) => <p className="text-[15px] leading-6 text-ink-80">{children}</p>,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-6 text-ink-80 marker:text-ink-60">{children}</ul>,
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-6 text-ink-80 marker:font-semibold marker:text-ink-60">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  a: Anchor,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  code: ({ children }) => <code className="rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-[13px] text-ink">{children}</code>,
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md border border-border bg-surface-alt px-4 py-3.5 font-mono text-[13px] leading-[21px] text-ink [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="flex flex-col gap-2 border-l-2 border-border-strong py-0.5 pl-4 text-[15px] leading-6 text-ink-60 [&_p]:text-ink-60">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-alt">{children}</thead>,
  th: ({ children }) => <th className="border-b border-border px-4 py-2.5 text-xs font-bold text-ink-60">{children}</th>,
  td: ({ children }) => <td className="border-t border-border px-4 py-2.5 align-top text-sm text-ink-80 first:border-t-0 [tr:first-child>&]:border-t-0">{children}</td>,
  hr: () => <hr className="border-border" />,
  img: ({ src, alt }) => <img src={typeof src === 'string' ? src : undefined} alt={alt ?? ''} className="max-w-full rounded-md" />
}

export interface MarkdownProps {
  children: string
  className?: string
}

/* Безопасный рендер Markdown: без rehype-raw, HTML выводится текстом */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn('flex flex-col gap-3.5 font-sans', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeUrl} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
