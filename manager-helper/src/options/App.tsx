import { useEffect, useState } from 'react'
import { checkBackend } from '@/shared/api'
import { useAuthSession } from '@/shared/auth'
import {
  DEFAULT_BACKEND_URL,
  getBackendUrl,
  normalizeBackendUrl,
  setBackendUrl,
} from '@/shared/settings'
import { TelegramSection } from './telegram/TelegramSection'

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
    // Макет «Окно настроек»: серый фон, белые карточки, фирменная красная кнопка.
    <div className="min-h-screen bg-surface-alt text-ink">
      <main className="mx-auto flex max-w-2xl flex-col gap-5 p-6">
        <h1 className="text-2xl font-semibold text-ink">Настройки Manager Helper</h1>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="backend-url" className="text-[13px] font-semibold text-ink">
            Адрес сервера
          </label>
          <input
            id="backend-url"
            className="h-13 w-full rounded-xl border border-field-line bg-white px-4 text-[15px] text-ink outline-none placeholder:text-ink-40 focus:border-brand-red"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
            }}
            placeholder={DEFAULT_BACKEND_URL}
          />
          <span className="text-xs text-ink-60">
            Для адреса не из localhost браузер запросит доступ к этому хосту. При смене адреса нужно
            войти заново.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            className="h-12 rounded-2xl bg-brand-red px-6 text-[15px] font-semibold text-white shadow-[0_6px_16px_#66000033] hover:bg-brand-red-hover"
            onClick={() => void save()}
          >
            Сохранить
          </button>
          <button
            type="button"
            className="text-sm font-semibold text-brand-red hover:text-brand-red-hover"
            onClick={() => void check()}
          >
            Проверить соединение
          </button>
          {status !== '' && (
            <span role="status" className="text-sm text-ink-60">
              {status}
            </span>
          )}
        </div>
        <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-5">
          <h2 className="text-base font-semibold text-ink">Аккаунт</h2>
          {session.status === 'authenticated' ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 break-words text-ink-80">
                Вы вошли как {session.user?.login ?? ''}
              </span>
              <button
                type="button"
                className="shrink-0 font-semibold text-brand-red hover:text-brand-red-hover"
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
        <TelegramSection />
      </main>
    </div>
  )
}
