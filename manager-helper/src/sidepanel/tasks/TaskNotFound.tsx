import { ArrowLeftIcon, FileXIcon } from '../icons'

interface Props {
  onBack?: () => void
  onShowList: () => void
}

export function TaskNotFound({ onBack, onShowList }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-3">
        {onBack && (
          <button
            type="button"
            aria-label="Назад"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-surface-alt"
            onClick={onBack}
          >
            <ArrowLeftIcon />
          </button>
        )}
        <span className="min-w-0 flex-1 truncate px-1 font-heading text-base font-semibold text-ink">
          Задача
        </span>
      </header>
      <div className="m-auto flex max-w-[316px] flex-col items-center px-4 py-8 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-surface-sunken text-ink-60">
          <FileXIcon />
        </span>
        <h2 className="mt-3 font-heading text-lg font-semibold text-ink">Задача не найдена</h2>
        <p className="mt-3 max-w-[280px] text-sm leading-[1.4] text-ink-60">
          Её удалили или у вас больше нет к ней доступа. Уведомление отмечено прочитанным.
        </p>
        <button
          type="button"
          className="mt-3 rounded-full border border-field-line bg-white px-[18px] py-2.5 text-sm font-medium text-ink hover:bg-surface-alt"
          onClick={onShowList}
        >
          К списку задач
        </button>
      </div>
    </div>
  )
}
