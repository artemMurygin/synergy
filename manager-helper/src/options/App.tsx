import { useEffect, useState } from 'react'
import { checkBackend } from '@/shared/api'
import { useAuthSession } from '@/shared/auth'
import {
  DEFAULT_BACKEND_URL,
  getBackendUrl,
  normalizeBackendUrl,
  setBackendUrl,
} from '@/shared/settings'

export function App() {
  const [url, setUrl] = useState(DEFAULT_BACKEND_URL)
  const [status, setStatus] = useState('')
  const session = useAuthSession()

  useEffect(() => {
    void getBackendUrl().then(setUrl)
  }, [])

  const save = async () => {
    if (!(await setBackendUrl(url))) {
      setStatus('Нужен адрес http:// или https:// и доступ к нему')
      return
    }
    setUrl(normalizeBackendUrl(url))
    setStatus('Сохранено')
  }

  const check = async () => {
    setStatus('Проверяю…')
    setStatus(await checkBackend(normalizeBackendUrl(url)))
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Настройки Manager Helper</h1>
      <div className="block space-y-1">
        <label htmlFor="backend-url" className="text-sm font-medium">
          Адрес сервера
        </label>
        <input
          id="backend-url"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value)
          }}
          placeholder={DEFAULT_BACKEND_URL}
        />
        <span className="block text-xs text-gray-500">
          Для адреса не из localhost браузер запросит доступ к этому хосту. При смене адреса нужно
          войти заново.
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          onClick={() => void save()}
        >
          Сохранить
        </button>
        <button
          type="button"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
          onClick={() => void check()}
        >
          Проверить соединение
        </button>
        <span className="text-sm text-gray-600">{status}</span>
      </div>
      <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Аккаунт</h2>
        {session.status === 'authenticated' ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink">Вы вошли как {session.user?.login ?? ''}</span>
            <button
              type="button"
              className="font-semibold text-brand-red"
              onClick={() => void session.logout()}
            >
              Выйти
            </button>
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
    </main>
  )
}
