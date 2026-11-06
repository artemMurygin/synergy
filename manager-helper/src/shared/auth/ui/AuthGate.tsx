import { useEffect, useState, type ReactNode } from 'react'
import { LoaderIcon } from '@/sidepanel/icons'
import { getBackendUrl } from '@/shared/settings'
import {
  InvalidCredentialsError,
  RateLimitedError,
  SamePasswordError,
  WeakPasswordError,
  WrongPasswordError,
} from '../auth-api'
import { useAuthSession } from '../use-auth-session'
import { ChangePasswordDialog, type ChangePasswordError } from './ChangePasswordDialog'
import { ConnectionError } from './ConnectionError'
import { LoginForm } from './LoginForm'

function openSettings(): void {
  void chrome.runtime.openOptionsPage()
}

export function AuthGate({ children }: { children: ReactNode }) {
  const session = useAuthSession()
  const [serverUrl, setServerUrl] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [retryAfter, setRetryAfter] = useState<number | null>(null)
  const [violations, setViolations] = useState<string[]>([])
  const [changeError, setChangeError] = useState<ChangePasswordError | null>(null)

  useEffect(() => {
    void getBackendUrl().then(setServerUrl)
  }, [session.status])

  const login = async (name: string, password: string) => {
    setLoginError(null)
    setRetryAfter(null)
    try {
      await session.login(name, password)
    } catch (error) {
      if (error instanceof InvalidCredentialsError) setLoginError('Неверный логин или пароль')
      else if (error instanceof RateLimitedError) setRetryAfter(error.retryAfter)
      else setLoginError('Не удалось войти. Проверьте подключение к серверу.')
    }
  }

  const change = async (current: string, next: string) => {
    setViolations([])
    setChangeError(null)
    try {
      await session.changePassword(current, next)
    } catch (error) {
      if (error instanceof WeakPasswordError) setViolations(error.violations)
      else if (error instanceof WrongPasswordError) setChangeError('wrong-password')
      else if (error instanceof SamePasswordError) setChangeError('same-password')
      else setChangeError('generic')
    }
  }

  switch (session.status) {
    case 'authenticated':
      return <>{children}</>
    case 'restoring':
      return (
        <div className="flex min-h-screen items-center justify-center gap-2 bg-white text-sm text-ink-60">
          <LoaderIcon />
          <span>Восстанавливаем сессию…</span>
        </div>
      )
    case 'offline':
      return (
        <ConnectionError
          onRetry={() => void session.retry()}
          serverUrl={serverUrl}
          onChangeServer={openSettings}
        />
      )
    case 'must-change-password':
      return (
        <ChangePasswordDialog
          onSubmit={change}
          onLogout={() => void session.logout()}
          violations={violations}
          error={changeError}
        />
      )
    case 'anonymous':
      return (
        <LoginForm
          onSubmit={login}
          error={loginError}
          retryAfter={retryAfter}
          logoutOffline={session.notice === 'logout-offline'}
          serverUrl={serverUrl}
          onChangeServer={openSettings}
        />
      )
  }
}
