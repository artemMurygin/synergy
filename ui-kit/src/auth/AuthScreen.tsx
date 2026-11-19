import type { ReactNode } from 'react'
import { CircleAlert } from '../icons'
import { AuthBrand } from './AuthBrand'

/** Экран авторизации: центрированная колонка 360 px; на ≥ 640 px — карточка на светлом фоне, на узких — без рамки. */
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="flex h-full min-h-dvh items-center justify-center bg-surface px-6 sm:bg-surface-sunken sm:p-2.5">
      <div className="flex w-full max-w-[360px] flex-col gap-6 sm:max-w-[420px] sm:rounded-2xl sm:bg-surface sm:p-10 sm:shadow-panel">
        <AuthBrand />
        {children}
      </div>
    </main>
  )
}

export function AuthHeading({ title, subtitle, level = 1 }: { title: string; subtitle?: string; level?: 1 | 2 }) {
  const Tag = level === 1 ? 'h1' : 'h2'
  return (
    <div className="flex flex-col gap-1.5">
      <Tag className="font-display text-[26px] leading-[33px] font-bold text-ink">{title}</Tag>
      {subtitle ? <p className="text-sm text-ink-60">{subtitle}</p> : null}
    </div>
  )
}

export function AuthAlert({ children }: { children: string }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-brand-red-soft px-3.5 py-3">
      <CircleAlert className="mt-px shrink-0 text-brand-red" />
      <p className="text-sm font-semibold text-ink">{children}</p>
    </div>
  )
}

export function AuthField({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink-80">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-ink-60">{hint}</p> : null}
    </div>
  )
}
