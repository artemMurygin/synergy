import { useEffect, useState } from 'react'
import { checkBackend } from '@/shared/api'
import {
  DEFAULT_BACKEND_URL,
  getBackendUrl,
  normalizeBackendUrl,
  setBackendUrl,
} from '@/shared/settings'

export function App() {
  const [url, setUrl] = useState(DEFAULT_BACKEND_URL)
  const [status, setStatus] = useState('')

  useEffect(() => {
    void getBackendUrl().then(setUrl)
  }, [])

  const save = async () => {
    await setBackendUrl(url)
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
      <label className="block space-y-1">
        <span className="text-sm font-medium">Адрес сервера</span>
        <input
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value)
          }}
          placeholder={DEFAULT_BACKEND_URL}
        />
        <span className="block text-xs text-gray-500">
          Расширение может обращаться только к localhost и 127.0.0.1 (любой порт).
        </span>
      </label>
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
    </main>
  )
}
