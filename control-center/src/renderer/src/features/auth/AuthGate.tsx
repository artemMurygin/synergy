import { ChangePasswordDialog, ConnectionError, LoginForm, RestoringScreen } from '@synergy/ui-kit'
import { useEffect, useState, type ReactNode } from 'react'
import { retryRestore } from './auth.api'
import { changePasswordErrorText, loginErrorText } from './auth-messages'
import { useChangePassword } from './use-change-password'
import { useLogin } from './use-login'
import { useLogout } from './use-logout'
import { useSession } from './use-session'
import { useSessionReset } from './session-reset'

export interface AuthGateProps {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const snapshot = useSession()
  const login = useLogin()
  const changePassword = useChangePassword()
  const logout = useLogout()
  const [retrying, setRetrying] = useState(false)
  useSessionReset()

  const retry = (): void => {
    setRetrying(true)
    void Promise.resolve(retryRestore()).finally(() => {
      setRetrying(false)
    })
  }

  switch (snapshot.state) {
    case 'restoring':
      return <RestoringScreen />
    case 'unauthenticated':
      return <LoginScreen login={login} retryAfterSec={snapshot.retryAfterSec} warning={snapshot.warning} />
    case 'mustChangePassword':
      return (
        <ChangePasswordDialog
          kind="forced"
          pending={changePassword.isPending}
          error={changePasswordErrorText(changePassword.error)}
          onSubmit={({ currentPassword, newPassword }) => { changePassword.mutate({ currentPassword, newPassword, confirmPassword: newPassword }); }
          }
          onLogout={() => { logout.mutate(); }}
        />
      )
    case 'connectionError':
      return <ConnectionError retrying={retrying} onRetry={retry} />
    case 'authenticated':
      return <>{children}</>
  }
}

function useCountdown(seconds: number | undefined, token: unknown): number {
  const [remaining, setRemaining] = useState(seconds && seconds > 0 ? Math.ceil(seconds) : 0)
  useEffect(() => {
    const start = seconds && seconds > 0 ? Math.ceil(seconds) : 0
    setRemaining(start)
    if (start === 0) return undefined
    const endAt = Date.now() + start * 1000
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      setRemaining(left)
      if (left === 0) clearInterval(timer)
    }, 250)
    return () => { clearInterval(timer); }
  }, [seconds, token])
  return remaining
}

function LoginScreen({ login, retryAfterSec, warning }: {
  login: ReturnType<typeof useLogin>
  retryAfterSec?: number
  warning?: string
}) {
  const error = login.error
  const limitSec = error ? (error.code === 'RATE_LIMITED' ? (error.retryAfterSec ?? retryAfterSec) : undefined) : retryAfterSec
  const remaining = useCountdown(limitSec, error ?? 'snapshot')
  const limited = remaining > 0
  const text = limited
    ? `Слишком много попыток входа. Повторите через ${String(remaining)} с.`
    : error?.code === 'RATE_LIMITED' || (!error && retryAfterSec)
      ? undefined
      : loginErrorText(error, undefined, warning)
  return (
    <LoginForm
      title="Вход в Control Center"
      pending={login.isPending}
      disabled={limited}
      error={text}
      onSubmit={(credentials) => { login.mutate(credentials); }}
    />
  )
}
