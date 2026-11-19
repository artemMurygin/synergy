import { Button, Input, LayoutModeProvider } from '@synergy/ui-kit'
import { useEffect, useState } from 'react'
import { checkBackend } from '@/shared/api'
import { useAuthSession } from '@/shared/auth'
import {
  DEFAULT_BACKEND_URL,
  getBackendUrl,
  getPortalUrl,
  normalizeBackendUrl,
  setBackendUrl,
  setPortalUrl,
} from '@/shared/settings'
import { TelegramSection } from './telegram/TelegramSection'

export function App() {
  const [url, setUrl] = useState(DEFAULT_BACKEND_URL)
  const [portalUrl, setPortalUrlValue] = useState('')
  const [status, setStatus] = useState('')
  const session = useAuthSession()

  useEffect(() => {
    void getBackendUrl().then(setUrl)
    void getPortalUrl().then((stored) => {
      setPortalUrlValue(stored ?? '')
    })
  }, [])

  const save = async () => {
    if (!(await setBackendUrl(url))) {
      setStatus('Нужен адрес http:// или https:// и доступ к нему')
      return
    }
    if (!(await setPortalUrl(portalUrl))) {
      setStatus('Адрес портала должен начинаться с http:// или https://')
      return
    }
    setUrl(normalizeBackendUrl(url))
    setPortalUrlValue(normalizeBackendUrl(portalUrl))
    setStatus('Сохранено')
  }

  const check = async () => {
    setStatus('Проверяю…')
    setStatus(await checkBackend(normalizeBackendUrl(url)))
  }

  return (
    <LayoutModeProvider mode="desktop">
      <div className="min-h-screen bg-surface-sunken text-ink">
        <main className="mx-auto flex max-w-2xl flex-col gap-5 p-6">
          <h1 className="font-display text-2xl font-bold text-ink">Настройки Manager Helper</h1>
          <section className="flex flex-col gap-5 rounded-xl bg-surface p-5 shadow-panel">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="backend-url" className="text-[13px] font-semibold text-ink">
                Адрес сервера
              </label>
              <Input
                id="backend-url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value)
                }}
                placeholder={DEFAULT_BACKEND_URL}
              />
              <span className="text-xs text-ink-60">
                Для адреса не из localhost браузер запросит доступ к этому хосту. При смене адреса
                нужно войти заново.
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="portal-url" className="text-[13px] font-semibold text-ink">
                Адрес портала
              </label>
              <Input
                id="portal-url"
                value={portalUrl}
                onChange={(event) => {
                  setPortalUrlValue(event.target.value)
                }}
                placeholder="https://portal.example.com"
              />
              <span className="text-xs text-ink-60">
                Заявки Featurer открываются по этому адресу в новой вкладке. Без адреса ссылки на
                заявки не работают.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button onClick={() => void save()}>Сохранить</Button>
              <Button variant="ghost" onClick={() => void check()}>
                Проверить соединение
              </Button>
              {status !== '' && (
                <span role="status" className="text-sm text-ink-60">
                  {status}
                </span>
              )}
            </div>
          </section>
          <section className="flex flex-col gap-2 rounded-xl bg-surface p-5 shadow-panel">
            <h2 className="text-base font-semibold text-ink">Аккаунт</h2>
            {session.status === 'authenticated' ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 break-words text-ink-80">
                  Вы вошли как {session.user?.login ?? ''}
                </span>
                <Button variant="ghost" className="shrink-0 text-brand-red" onClick={() => void session.logout()}>
                  Выйти
                </Button>
              </div>
            ) : (
              <p className="text-sm text-ink-60">
                {session.status === 'restoring'
                  ? 'Проверяем вход…'
                  : session.status === 'offline'
                    ? 'Нет связи с сервером. Проверьте адрес выше.'
                    : 'Вход не выполнен. Войдите в боковой панели расширения.'}
              </p>
            )}
          </section>
          <TelegramSection />
        </main>
      </div>
    </LayoutModeProvider>
  )
}
