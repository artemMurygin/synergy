import { useEffect, useRef, useState } from 'react'
import { Timer } from '../icons'
import { Button } from '../primitives/Button'
import { formatCountdown } from './format-countdown'

export type RateLimitBlockProps = {
  /** Через сколько секунд сервер разрешил повтор (429); для нового лимита блок перемонтируют (`key`). */
  retryAfterSec: number
  /** Время вышло: форма снова доступна. */
  onExpire: () => void
}

/** Лимит попыток входа (макет uTccU): алерт с таймером и недоступная кнопка с обратным отсчётом. */
export function RateLimitBlock({ retryAfterSec, onExpire }: RateLimitBlockProps) {
  const [left, setLeft] = useState(Math.max(0, Math.ceil(retryAfterSec)))
  const expired = useRef(false)

  useEffect(() => {
    const id = setInterval(() => {
      setLeft((value) => Math.max(0, value - 1))
    }, 1000)
    return () => {
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (left > 0 || expired.current) return
    expired.current = true
    onExpire()
  }, [left, onExpire])

  return (
    <div className="flex flex-col gap-3.5">
      <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-brand-red-soft px-3.5 py-3">
        <Timer className="mt-px shrink-0 text-brand-red" />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-ink">Слишком много попыток входа</p>
          <p className="text-[13px] text-ink-80">Форма разблокируется автоматически. Попробуйте ещё раз немного позже.</p>
        </div>
      </div>
      <Button type="button" disabled className="w-full rounded-full">
        Повторить через {formatCountdown(left)}
      </Button>
    </div>
  )
}
