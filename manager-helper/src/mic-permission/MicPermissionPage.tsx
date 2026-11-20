import { Button } from '@synergy/ui-kit'
import { Mic, MicOff } from '@synergy/ui-kit/icons'
import { useEffect, useState } from 'react'

type State = 'asking' | 'granted' | 'denied'

/** Asks for the microphone on a page of the extension: the side panel cannot show the question. */
export function MicPermissionPage() {
  const [state, setState] = useState<State>('asking')

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let stale = false
    navigator.mediaDevices.getUserMedia({ audio: true }).then(
      (stream) => {
        for (const track of stream.getTracks()) track.stop()
        if (!stale) setState('granted')
      },
      () => {
        if (!stale) setState('denied')
      },
    )
    return () => {
      stale = true
    }
  }, [attempt])

  const ask = () => {
    setState('asking')
    setAttempt((n) => n + 1)
  }

  const denied = state === 'denied'
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-sunken p-6 font-chat">
      <section className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl bg-surface p-8 text-center">
        <span
          className={`flex size-12 items-center justify-center rounded-full ${denied ? 'bg-warning-soft text-warning' : 'bg-brand-red-soft text-brand-red'}`}
        >
          {denied ? <MicOff size={22} /> : <Mic size={22} />}
        </span>
        {state === 'asking' && (
          <>
            <h1 className="font-display text-xl font-semibold text-ink">Доступ к микрофону</h1>
            <p className="text-sm text-ink-60">Разрешите доступ в запросе браузера.</p>
          </>
        )}
        {state === 'granted' && (
          <>
            <h1 className="font-display text-xl font-semibold text-ink">Можно вернуться в панель</h1>
            <p className="text-sm text-ink-60">
              Доступ выдан. Закройте эту вкладку и нажмите микрофон в чате ещё раз.
            </p>
          </>
        )}
        {denied && (
          <>
            <h1 className="font-display text-xl font-semibold text-ink">Нет доступа к микрофону</h1>
            <p className="text-sm text-ink-60">
              Разрешите микрофон для расширения в настройках сайта браузера и запросите снова.
            </p>
            <Button onClick={ask}>Запросить снова</Button>
          </>
        )}
      </section>
    </main>
  )
}
