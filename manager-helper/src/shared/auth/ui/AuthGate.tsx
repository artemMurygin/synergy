import { ChangePasswordDialog, ConnectionError, LoginForm, RestoringScreen } from '@synergy/ui-kit'
import { useEffect, useState, type ReactNode } from 'react'
import { getBackendUrl } from '@/shared/settings'
import { InvalidCredentialsError, RateLimitedError } from '../auth-api'
import { useAuthSession } from '../use-auth-session'
import { passwordErrorText } from './password-error'
import { ServerLine } from './ServerLine'

function openSettings(): void {
  void chrome.runtime.openOptionsPage()
}

function formatCountdown(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/** Seconds left until the next login attempt is allowed (429); 0 when not blocked. */
function useRetryCountdown(retryAfter: number | null): number {
  const [remaining, setRemaining] = useState(retryAfter ?? 0)
  const [seen, setSeen] = useState(retryAfter)
  if (seen !== retryAfter) {
    setSeen(retryAfter)
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
  return remaining
}

export function AuthGate({ children }: { children: ReactNode }) {
  const session = useAuthSession()
  const [serverUrl, setServerUrl] = useState('')
  const [pending, setPending] = useState(false)
  const [loginError, setLoginError] = useState<string | undefined>(undefined)
  const [retryAfter, setRetryAfter] = useState<number | null>(null)
  const [changeError, setChangeError] = useState<string | undefined>(undefined)
  const [retrying, setRetrying] = useState(false)
  const remaining = useRetryCountdown(retryAfter)

  useEffect(() => {
    void getBackendUrl().then(setServerUrl)
  }, [session.status])

  const login = async ({ login: name, password }: { login: string; password: string }) => {
    if (remaining > 0) return
    setLoginError(undefined)
    setRetryAfter(null)
    setPending(true)
    try {
      await session.login(name, password)
    } catch (error) {
      if (error instanceof InvalidCredentialsError) setLoginError('Неверный логин или пароль')
      else if (error instanceof RateLimitedError) setRetryAfter(error.retryAfter)
      else {
        setLoginError('Не удалось войти. Проверьте подключение к серверу и попробуйте снова.')
      }
    } finally {
      setPending(false)
    }
  }

  const change = async ({
    currentPassword,
    newPassword,
  }: {
    currentPassword: string
    newPassword: string
  }) => {
    setChangeError(undefined)
    setPending(true)
    try {
      await session.changePassword(currentPassword, newPassword)
    } catch (error) {
      setChangeError(passwordErrorText(error, 'forced'))
    } finally {
      setPending(false)
    }
  }

  const retry = async () => {
    setRetrying(true)
    try {
      await session.retry()
    } finally {
      setRetrying(false)
    }
  }

  const server = <ServerLine serverUrl={serverUrl} onChangeServer={openSettings} />

  switch (session.status) {
    case 'authenticated':
      return <>{children}</>
    case 'restoring':
      return <RestoringScreen footer={server} />
    case 'offline':
      return <ConnectionError onRetry={() => void retry()} retrying={retrying} footer={server} />
    case 'must-change-password':
      return (
        <ChangePasswordDialog
          kind="forced"
          onSubmit={(passwords) => void change(passwords)}
          onLogout={() => void session.logout()}
          error={changeError}
          pending={pending}
        />
      )
    case 'anonymous':
      return (
        <LoginForm
          title="Manager Helper"
          subtitle="Войдите, чтобы работать с чатами"
          onSubmit={(credentials) => void login(credentials)}
          error={
            remaining > 0
              ? `Слишком много попыток. Повторите через ${formatCountdown(remaining)}`
              : loginError
          }
          pending={pending}
          footer={
            <div className="flex flex-col gap-3">
              {session.notice === 'logout-offline' && (
                <div role="status" className="rounded-lg bg-surface-alt px-3.5 py-3 text-xs">
                  <p className="font-semibold text-ink">Вы вышли без связи с сервером</p>
                  <p className="text-ink-60">
                    Сессия на сервере могла остаться активной и завершится по истечении срока.
                  </p>
                </div>
              )}
              {server}
            </div>
          }
        />
      )
  }
}
