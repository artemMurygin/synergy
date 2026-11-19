import { useId, useState, type SubmitEvent, type ReactNode } from 'react'
import { Button } from '../primitives/Button'
import { Input } from '../primitives/Input'
import { PasswordField } from '../primitives/PasswordField'
import { AuthAlert, AuthField, AuthHeading, AuthScreen } from './AuthScreen'

export type LoginFormProps = {
  onSubmit: (credentials: { login: string; password: string }) => void
  error?: string
  pending: boolean
  /** Блокирует отправку (например, пока действует лимит попыток). */
  disabled?: boolean
  title?: string
  subtitle?: string
  /** Слот под кнопкой: строка «Сервер: … Изменить» и т. п. */
  footer?: ReactNode
}

/** Экран входа (макет xvSk3): логин, пароль, ошибка, слот `footer`. */
export function LoginForm({
  onSubmit,
  error,
  pending,
  disabled = false,
  title = 'Вход',
  subtitle = 'Введите логин и пароль, которые выдал администратор.',
  footer,
}: LoginFormProps) {
  const loginId = useId()
  const passwordId = useId()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ login?: string; password?: string }>({})

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled) return
    const next = {
      login: login.trim() ? undefined : 'Введите логин',
      password: password ? undefined : 'Введите пароль',
    }
    setErrors(next)
    if (next.login || next.password) return
    onSubmit({ login: login.trim(), password })
  }

  return (
    <AuthScreen>
      <AuthHeading title={title} subtitle={subtitle} />
      <form noValidate onSubmit={submit} className="flex flex-col gap-6">
        {error ? <AuthAlert>{error}</AuthAlert> : null}
        <div className="flex flex-col gap-3.5">
          <AuthField label="Логин" htmlFor={loginId}>
            <Input
              id={loginId}
              autoComplete="username"
              autoCapitalize="none"
              disabled={pending}
              value={login}
              error={errors.login}
              placeholder="Введите логин"
              onChange={(e) => {
                setLogin(e.target.value)
              }}
            />
          </AuthField>
          <AuthField label="Пароль" htmlFor={passwordId}>
            <PasswordField
              id={passwordId}
              autoComplete="current-password"
              disabled={pending}
              value={password}
              error={errors.password}
              placeholder="Введите пароль"
              onChange={(e) => {
                setPassword(e.target.value)
              }}
            />
          </AuthField>
        </div>
        <Button type="submit" disabled={pending || disabled} className="w-full rounded-full">
          {pending ? 'Входим…' : 'Войти'}
        </Button>
      </form>
      {footer ? <div className="text-[13px] text-ink-60">{footer}</div> : null}
    </AuthScreen>
  )
}
