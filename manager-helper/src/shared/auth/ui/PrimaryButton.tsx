import type { ReactNode } from 'react'

interface Props {
  disabled: boolean
  children: ReactNode
}

/** Button / Master: red fill; disabled is grey-30 with ink-40 text. */
export function PrimaryButton({ disabled, children }: Props) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="h-12 w-full rounded-xl bg-brand-red text-sm font-semibold text-white shadow-[0_6px_16px_#66000033] hover:bg-brand-red-hover disabled:bg-[#e5e6ea] disabled:text-ink-40 disabled:shadow-none"
    >
      {children}
    </button>
  )
}
