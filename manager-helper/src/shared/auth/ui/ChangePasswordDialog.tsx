import { useState } from 'react'
import { AlertCircleIcon } from '@/sidepanel/icons'
import { RunNotice } from '@/sidepanel/RunNotice'
import { PasswordField } from './PasswordField'
import { PrimaryButton } from './PrimaryButton'

export type ChangePasswordError = 'wrong-password' | 'same-password' | 'generic'

interface Props {
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void> | void
  onLogout: () => void
  /** Policy violations reported by the server (WEAK_PASSWORD). */
  violations?: string[]
  error?: ChangePasswordError | null
}

const SAME = 'Новый пароль не должен совпадать с временным'
const POLICY = 'Не короче 10 символов, буква и цифра'

const VIOLATION_TEXT: Record<string, string> = {
  'too-short': 'Пароль короче 10 символов',
  'no-letter': 'Добавьте хотя бы одну букву',
  'no-digit': 'Добавьте хотя бы одну цифру',
  'same-as-login': 'Пароль не должен совпадать с логином',
  'same-as-current': 'Новый пароль не должен совпадать с текущим',
}

export function ChangePasswordDialog({ onSubmit, onLogout, violations = [], error = null }: Props) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [local, setLocal] = useState<'same' | 'mismatch' | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.SyntheticEvent) => {
    event.preventDefault()
    if (next === current) {
      setLocal('same')
      return
    }
    if (next !== repeat) {
      setLocal('mismatch')
      return
    }
    setLocal(null)
    setBusy(true)
    try {
      await onSubmit(current, next)
    } finally {
      setBusy(false)
    }
  }

  const same = local === 'same' || error === 'same-password'
  const mismatch = local === 'mismatch'
  const weak = violations.length > 0
  const empty = current === '' || next === '' || repeat === ''

  return (
    <div className="flex min-h-screen flex-col justify-center bg-surface-sunken p-4">
      <form
        className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-[0_4px_16px_#0000000f]"
        onSubmit={(event) => void submit(event)}
      >
        <h1 className="text-[22px] font-bold text-ink">Смените пароль</h1>
        <p className="text-sm text-ink-60">
          Вы вошли с временным паролем. Задайте новый пароль, чтобы продолжить.
        </p>
        <PasswordField
          label="Временный пароль"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          invalid={error === 'wrong-password'}
        />
        <PasswordField
          label="Новый пароль"
          value={next}
          onChange={setNext}
          placeholder="Введите новый пароль"
          autoComplete="new-password"
          invalid={same || weak}
          hint={same ? SAME : weak ? undefined : POLICY}
          hintTone={same ? 'error' : 'muted'}
        >
          {weak && !same && (
            <ul className="list-disc pl-4 text-xs text-brand-red">
              {violations.map((violation) => (
                <li key={violation}>{VIOLATION_TEXT[violation] ?? violation}</li>
              ))}
            </ul>
          )}
        </PasswordField>
        <PasswordField
          label="Повторите новый пароль"
          value={repeat}
          onChange={setRepeat}
          placeholder="Повторите новый пароль"
          autoComplete="new-password"
          invalid={mismatch}
          hint={mismatch ? 'Пароли не совпадают' : undefined}
          hintTone="error"
        />
        {error === 'wrong-password' && (
          <RunNotice
            tone="error"
            role="alert"
            icon={<AlertCircleIcon />}
            title="Неверный временный пароль"
            text="Проверьте пароль и попробуйте снова."
          />
        )}
        {error === 'generic' && (
          <RunNotice
            tone="error"
            role="alert"
            icon={<AlertCircleIcon />}
            title="Не удалось сменить пароль"
            text="Попробуйте ещё раз."
          />
        )}
        <PrimaryButton disabled={busy || empty}>Сменить пароль</PrimaryButton>
        <button
          type="button"
          className="self-center text-[13px] font-semibold text-ink-60"
          onClick={onLogout}
        >
          Выйти
        </button>
      </form>
    </div>
  )
}
