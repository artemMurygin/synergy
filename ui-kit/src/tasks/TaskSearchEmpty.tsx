import { RotateCcw, SearchX } from '../icons'
import { Button } from '../primitives/Button'

export type TaskSearchEmptyProps = {
  onReset?: () => void
}

/** Пустой результат поиска и фильтров. */
export function TaskSearchEmpty({ onReset }: TaskSearchEmptyProps) {
  return (
    <div className="m-auto flex w-full max-w-[320px] flex-col items-center gap-3 p-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-surface-alt text-ink-60">
        <SearchX size={24} />
      </span>
      <h2 className="font-display text-lg font-semibold text-ink">Ничего не найдено</h2>
      <p className="text-sm text-ink-60">Измените фильтры или поисковый запрос</p>
      {onReset ? (
        <Button variant="secondary" className="h-10 rounded-full px-5 text-sm" onClick={onReset}>
          <RotateCcw size={16} className="text-ink-80" />
          Сбросить фильтры
        </Button>
      ) : null}
    </div>
  )
}
