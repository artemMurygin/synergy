import { Dialog as DialogPrimitive } from 'radix-ui'
import { Trash2 } from '../icons'
import { useOptionalLayoutMode } from '../layout/layout-mode'
import { Button } from '../primitives/Button'
import { Sheet, SheetContent } from '../primitives/Sheet'

export type TaskDeleteConfirmProps = {
  taskTitle: string
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
}

const TITLE = 'Удалить задачу?'

/** Подтверждение удаления: диалог на desktop / tablet, шторка на mobile. Рисуется открытым, закрытие — onCancel. */
export function TaskDeleteConfirm({ taskTitle, onConfirm, onCancel, pending = false }: TaskDeleteConfirmProps) {
  const mobile = useOptionalLayoutMode() === 'mobile'
  const text = `Задача «${taskTitle}» пропадёт из списков. Вложения станут недоступны.`
  const onOpenChange = (open: boolean) => {
    if (!open && !pending) onCancel()
  }

  if (mobile) {
    return (
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent side="bottom" aria-label={TITLE} description={text} className="gap-0 px-5 pb-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-red-soft text-brand-red">
                <Trash2 size={20} />
              </span>
              <h2 className="font-display text-xl font-semibold text-ink">{TITLE}</h2>
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <Button className="h-12 w-full rounded-full" disabled={pending} onClick={onConfirm}>
                <Trash2 size={16} />
                Удалить задачу
              </Button>
              <Button variant="secondary" className="h-12 w-full rounded-full" disabled={pending} onClick={onCancel}>
                Отмена
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <DialogPrimitive.Root open onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-3xl bg-surface p-6 shadow-[0_12px_32px_var(--color-shadow-card)] outline-none">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-red-soft text-brand-red">
            <Trash2 size={22} />
          </span>
          <DialogPrimitive.Title className="font-display text-xl font-semibold text-ink">{TITLE}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-ink-60">{text}</DialogPrimitive.Description>
          <div className="flex justify-end gap-3 pt-3">
            <Button variant="secondary" className="h-11 rounded-full px-5" disabled={pending} onClick={onCancel}>
              Отмена
            </Button>
            <Button className="h-11 rounded-full px-5" disabled={pending} onClick={onConfirm}>
              Удалить
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
