import { ChangePasswordDialog, ConnectionError, LoginForm, RateLimitBlock, RestoringScreen } from '@synergy/ui-kit'
import { useState, type ReactNode } from 'react'
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
          error={changePasswordErrorText(changePassword.error, 'forced')}
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

function LoginScreen({ login, retryAfterSec, warning }: {
  login: ReturnType<typeof useLogin>
  retryAfterSec?: number
  warning?: string
}) {
  const error = login.error
  const limitSec = error ? (error.code === 'RATE_LIMITED' ? (error.retryAfterSec ?? retryAfterSec) : undefined) : retryAfterSec
  const limitKey: unknown = error ?? 'snapshot'
  // The countdown of a limit that has run out is remembered by its key: the form is free again
  const [expiredKey, setExpiredKey] = useState<unknown>(null)
  const hasLimit = limitSec !== undefined && limitSec > 0
  const limited = hasLimit && expiredKey !== limitKey
  const text = hasLimit ? undefined : loginErrorText(error, undefined, warning)
  return (
    <LoginForm
      title="Вход в Control Center"
      pending={login.isPending}
      disabled={limited}
      error={text}
      footer={
        limited ? (
          <RateLimitBlock
            key={String(limitSec)}
            retryAfterSec={limitSec}
            onExpire={() => {
              setExpiredKey(limitKey)
            }}
          />
        ) : undefined
      }
      onSubmit={(credentials) => { login.mutate(credentials); }}
    />
  )
}
