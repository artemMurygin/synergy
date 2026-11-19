import { ChangePasswordDialog, ConnectionError, LoginForm, RestoringScreen } from '@synergy/ui-kit'
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
    Promise.resolve(retryRestore()).finally(() => setRetrying(false))
  }

  switch (snapshot.state) {
    case 'restoring':
      return <RestoringScreen />
    case 'unauthenticated':
      return (
        <LoginForm
          title="Вход в Control Center"
          pending={login.isPending}
          error={loginErrorText(login.error, snapshot.retryAfterSec, snapshot.warning)}
          onSubmit={(credentials) => login.mutate(credentials)}
        />
      )
    case 'mustChangePassword':
      return (
        <ChangePasswordDialog
          kind="forced"
          pending={changePassword.isPending}
          error={changePasswordErrorText(changePassword.error)}
          onSubmit={({ currentPassword, newPassword }) =>
            changePassword.mutate({ currentPassword, newPassword, confirmPassword: newPassword })
          }
          onLogout={() => logout.mutate()}
        />
      )
    case 'connectionError':
      return <ConnectionError retrying={retrying} onRetry={retry} />
    case 'authenticated':
      return <>{children}</>
  }
}
