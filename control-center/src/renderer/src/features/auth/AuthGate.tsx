import type { ReactNode } from 'react'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { ConnectionError } from './ConnectionError'
import { LoginForm } from './LoginForm'
import { RestoringScreen } from './RestoringScreen'
import { retryRestore } from './auth.api'
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
  useSessionReset()

  switch (snapshot.state) {
    case 'restoring':
      return <RestoringScreen />
    case 'unauthenticated':
      return (
        <LoginForm
          onSubmit={(loginName, password) => login.mutate({ login: loginName, password })}
          isSubmitting={login.isPending}
          error={login.error ? { code: login.error.code, retryAfterSec: login.error.retryAfterSec } : null}
          warning={snapshot.warning}
          retryAfterSec={snapshot.retryAfterSec}
        />
      )
    case 'mustChangePassword':
      return (
        <ChangePasswordDialog
          onSubmit={(currentPassword, newPassword) =>
            changePassword.mutate({ currentPassword, newPassword, confirmPassword: newPassword })
          }
          onLogout={() => logout.mutate()}
          isSubmitting={changePassword.isPending}
          error={changePassword.error ? { code: changePassword.error.code } : null}
        />
      )
    case 'connectionError':
      return <ConnectionError onRetry={() => void retryRestore()} />
    case 'authenticated':
      return <>{children}</>
  }
}
