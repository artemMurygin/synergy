import { FileX } from '../icons'
import { Button } from '../primitives/Button'

export type TaskNotFoundProps = {
  onBack: () => void
  text?: string
}

export function TaskNotFound({ onBack, text = 'Её удалили или у вас больше нет к ней доступа.' }: TaskNotFoundProps) {
  return (
    <div role="alert" className="m-auto flex max-w-[320px] flex-col items-center gap-3 p-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-surface-alt text-ink-60">
        <FileX size={24} />
      </span>
      <h2 className="font-display text-lg font-semibold text-ink">Задача не найдена</h2>
      <p className="text-sm text-ink-60">{text}</p>
      <Button variant="secondary" className="h-10 rounded-full px-5 text-sm" onClick={onBack}>
        К списку задач
      </Button>
    </div>
  )
}
