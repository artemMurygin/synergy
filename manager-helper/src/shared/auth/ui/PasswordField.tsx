import { useId, useState } from 'react'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  invalid?: boolean
  hint?: string
  hintTone?: 'muted' | 'error'
  children?: React.ReactNode
}

export const inputClass =
  'h-12 w-full rounded-xl border bg-white px-3.5 text-sm text-ink outline-none placeholder:text-ink-40 focus:border-ink-60'

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  )
}

export function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  invalid = false,
  hint,
  hintTone = 'muted',
  children,
}: Props) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={invalid}
          className={`${inputClass} pr-11 ${invalid ? 'border-brand-red' : 'border-line'}`}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
        <button
          type="button"
          aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-60 hover:text-ink"
          onClick={() => {
            setVisible((v) => !v)
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="m3 3 18 18" />}
          </svg>
        </button>
      </div>
      {hint !== undefined && (
        <span className={`text-xs ${hintTone === 'error' ? 'text-brand-red' : 'text-ink-60'}`}>
          {hint}
        </span>
      )}
      {children}
    </Field>
  )
}
