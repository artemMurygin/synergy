import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { returnToFrom, useLogin, useSession, type AuthErrorCode } from '@/features/auth'
import { Glyph, IconField, ServerUnavailableView, SessionRestoringView } from '@/features/auth/ui/auth-ui'

const MESSAGE: Record<AuthErrorCode, string> = {
  INVALID_CREDENTIALS: 'Неверный логин или пароль',
  RATE_LIMITED: 'Слишком много попыток входа. Подождите немного и повторите.',
  UNAVAILABLE: 'Сервер недоступен. Проверьте соединение и повторите попытку.',
  UNEXPECTED: 'Не удалось выполнить вход. Попробуйте ещё раз.'
}

export function LoginPage() {
  const location = useLocation()
  const { status } = useSession()
  const login = useLogin()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ login?: string; password?: string }>({})

  // after a successful login (or when already signed in) go back to the requested address
  if (status === 'signedIn') return <Navigate to={returnToFrom(location.state)} replace />
  if (status === 'restoring') return <SessionRestoringView />
  if (status === 'unavailable') return <ServerUnavailableView />

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const next = {
      login: name.trim() ? undefined : 'Введите логин',
      password: password ? undefined : 'Введите пароль'
    }
    setErrors(next)
    if (next.login || next.password) return
    login.mutate({ login: name.trim(), password })
  }

  const wrongCredentials = login.isError && login.error.code === 'INVALID_CREDENTIALS'

  return (
    <div className="flex min-h-full flex-col bg-surface min-[900px]:flex-row">
      <aside className="flex flex-col gap-4 bg-ink px-6 py-7 min-[900px]:w-[620px] min-[900px]:shrink-0 min-[900px]:justify-between min-[900px]:gap-0 min-[900px]:p-14">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-brand-red text-white min-[900px]:size-9">
            <Glyph name="lightbulb" size={18} className="min-[900px]:size-5" />
          </div>
          <div className="flex flex-col">
            <p className="font-display text-[17px] font-bold leading-[22px] text-white min-[900px]:leading-[normal] min-[900px]:text-[18px]">Портал разработки ИИ-агентов</p>
            <p className="hidden text-[12px] text-ink-40 min-[900px]:block">Synergy</p>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <p className="hidden text-[13px] font-bold tracking-[0.4px] text-brand-red min-[900px]:block">Рутина → навык ИИ</p>
          <p className="font-display text-[24px] font-semibold leading-[29px] tracking-[-0.5px] text-white min-[900px]:text-[40px] min-[900px]:leading-[1.15] min-[900px]:tracking-[-1px]">
            Расскажите, что съедает ваше время. Мы научим агентов делать это за вас.
          </p>
          <p className="hidden w-[375px] text-[16px] leading-normal text-ink-40 min-[900px]:block">
            Подайте идею и следите, как она проходит путь от рассмотрения до запуска.
          </p>
        </div>
        <div aria-hidden="true" className="hidden h-[37px] min-[900px]:block" />
      </aside>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pt-7 pb-6 min-[900px]:p-14">
        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex w-full flex-1 flex-col gap-[18px] min-[900px]:max-w-[400px] min-[900px]:flex-none min-[900px]:gap-6"
        >
          <div className="flex flex-col gap-1.5 min-[900px]:gap-2">
            <h1 className="font-display text-[24px] font-bold leading-[31px] tracking-[-0.4px] text-ink min-[900px]:text-[32px] min-[900px]:leading-[normal] min-[900px]:tracking-[-0.6px]">Вход в портал</h1>
            <p className="text-[13px] leading-[19px] text-ink-60 min-[900px]:text-[14px] min-[900px]:leading-5">
              <span className="min-[900px]:hidden">Учётная запись Synergy — та же, что в Control Center.</span>
              <span className="hidden min-[900px]:inline">Учётная запись Synergy — та же, что в Control Center и расширении Manager Helper.</span>
            </p>
          </div>
          {login.isError ? (
            <Alert title={MESSAGE[login.error.code] ?? MESSAGE.UNEXPECTED}>
              {wrongCredentials ? 'Проверьте раскладку и Caps Lock.' : null}
            </Alert>
          ) : null}
          <IconField
            label="Логин"
            icon="user"
            placeholder="Например, ivanov"
            autoComplete="username"
            value={name}
            error={errors.login}
            invalid={wrongCredentials}
            onChange={(e) => setName(e.target.value)}
          />
          <IconField
            label="Пароль"
            icon="lock"
            type="password"
            reveal
            placeholder="Введите пароль"
            autoComplete="current-password"
            value={password}
            error={errors.password}
            invalid={wrongCredentials}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" disabled={login.isPending} className="w-full">
            {login.isPending ? 'Входим…' : 'Войти'}
            {login.isPending ? null : <Glyph name="arrow-right" size={18} />}
          </Button>
          <div className="mt-auto flex items-start gap-2 border-t border-border pt-3.5 min-[900px]:mt-0 min-[900px]:items-center min-[900px]:pt-4">
            <Glyph name="life-buoy" size={16} className="mt-px text-ink-40 min-[900px]:mt-0" />
            <p className="text-[12px] leading-[1.4] text-ink-60 min-[900px]:whitespace-nowrap min-[900px]:text-[13px] min-[900px]:leading-[normal]">
              Нет доступа или забыли пароль? Напишите администратору.
            </p>
          </div>
        </form>
      </main>
    </div>
  )
}
