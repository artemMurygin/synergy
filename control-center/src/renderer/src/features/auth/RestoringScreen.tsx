import { LoaderCircle } from 'lucide-react'

export function RestoringScreen() {
  return (
    <div className="flex min-h-full w-full items-center justify-center bg-surface-alt p-8">
      <div
        role="status"
        className="flex w-full max-w-[460px] flex-col items-center gap-6 rounded-lg border bg-surface p-[47px]"
      >
        <LoaderCircle aria-hidden className="size-8 animate-spin text-brand-red" />
        <div className="flex w-full flex-col gap-2">
          <p className="font-display text-[22px] leading-7 font-bold text-ink">Восстанавливаем сессию</p>
          <p className="text-sm leading-[1.4] text-ink-60">Проверяем сохранённый вход.</p>
        </div>
      </div>
    </div>
  )
}
