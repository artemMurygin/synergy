import { useEffect, useId, useState } from 'react'
import { AlertCircleIcon } from '@/sidepanel/icons'
import { RunNotice } from '@/sidepanel/RunNotice'
import { Field, PasswordField, inputClass } from './PasswordField'
import { PrimaryButton } from './PrimaryButton'
import { ServerLine } from './ServerLine'

interface Props {
  onSubmit: (login: string, password: string) => Promise<void> | void
  error: string | null
  /** Seconds until the next attempt is allowed (429). */
  retryAfter: number | null
  /** The previous logout could not reach the server. */
  logoutOffline?: boolean
  serverUrl: string
  onChangeServer: () => void
}

function formatCountdown(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function LoginForm({
  onSubmit,
  error,
  retryAfter,
  logoutOffline = false,
  serverUrl,
  onChangeServer,
}: Props) {
  const loginId = useId()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(retryAfter ?? 0)

  const [seenRetryAfter, setSeenRetryAfter] = useState(retryAfter)
  if (seenRetryAfter !== retryAfter) {
    setSeenRetryAfter(retryAfter)
    setRemaining(retryAfter ?? 0)
  }

  const counting = remaining > 0
  useEffect(() => {
    if (!counting) return
    const timer = setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1))
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [counting])

  const blocked = remaining > 0
  const disabled = busy || blocked || login.trim() === '' || password === ''

  const submit = async (event: React.SyntheticEvent) => {
    event.preventDefault()
    if (disabled) return
    setBusy(true)
    try {
      await onSubmit(login.trim(), password)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center gap-6 bg-white p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-[26px] font-bold text-ink">Manager Helper</h1>
        <p className="text-sm text-ink-60">Войдите, чтобы работать с чатами</p>
      </header>
      {logoutOffline && (
        <RunNotice
          tone="neutral"
          role="status"
          icon={<AlertCircleIcon />}
          title="Вы вышли без связи с сервером"
          text="Сессия на сервере могла остаться активной и завершится по истечении срока."
        />
      )}
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <Field label="Логин" htmlFor={loginId}>
          <input
            id={loginId}
            value={login}
            placeholder="Введите логин"
            autoComplete="username"
            className={`${inputClass} border-line`}
            onChange={(event) => {
              setLogin(event.target.value)
            }}
          />
        </Field>
        <PasswordField
          label="Пароль"
          value={password}
          onChange={setPassword}
          placeholder="Введите пароль"
          autoComplete="current-password"
        />
        {blocked ? (
          <RunNotice
            tone="error"
            role="alert"
            icon={<AlertCircleIcon />}
            title="Слишком много попыток"
            text={`Повторите через ${formatCountdown(remaining)}`}
          />
        ) : (
          error !== null && (
            <RunNotice tone="error" role="alert" icon={<AlertCircleIcon />} title={error} text="" />
          )
        )}
        <PrimaryButton disabled={disabled}>
          {blocked ? `Войти (${formatCountdown(remaining)})` : 'Войти'}
        </PrimaryButton>
      </form>
      <ServerLine serverUrl={serverUrl} onChangeServer={onChangeServer} />
    </div>
  )
}
