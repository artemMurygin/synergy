import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export const WONT_FIX_REASON_MAX = 2000

export interface WontFixDialogProps {
  open: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
  pending: boolean
}

function WontFixForm({ onConfirm, onClose, pending }: Omit<WontFixDialogProps, 'open'>) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title="Не будет исправлен"
      description="Автор увидит причину на экране обращения и в уведомлении."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button onClick={() => onConfirm(trimmed)} disabled={pending || trimmed.length === 0}>
            Закрыть без исправления
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Textarea
          label="Причина"
          hint="обязательно, до 2000 символов"
          placeholder="Объясните автору, почему проблему не будем исправлять"
          maxLength={WONT_FIX_REASON_MAX}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={pending}
        />
        <div className="flex items-start justify-between gap-3 text-xs leading-[1.4] text-ink-60">
          <p>Если это повтор, укажите название или дату исходного обращения</p>
          <span className="shrink-0">
            {reason.length} / {WONT_FIX_REASON_MAX}
          </span>
        </div>
      </div>
    </Dialog>
  )
}

/** Reason dialog of the «Не будет исправлен» transition: the confirmation needs a non-blank reason of up to 2000 characters. */
export function WontFixDialog({ open, ...rest }: WontFixDialogProps) {
  return open ? <WontFixForm {...rest} /> : null
}
