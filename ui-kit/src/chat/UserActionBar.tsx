import { ActionBarPrimitive, useAuiState } from '@assistant-ui/react'
import { Check, Copy, Pencil } from '../icons'
import { cn } from '../lib/cn'
import { useThreadActions } from './thread-context'

const ACTION =
  'flex h-[23px] items-center gap-1 rounded-sm px-2 font-chat text-xs font-medium text-ink-60 outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:cursor-not-allowed disabled:opacity-50'

export type UserActionBarProps = {
  /** The server can restart the chat from this message (its id is known and it is `editable`). */
  canEdit: boolean
}

/** Actions under a question of the user: "Копировать" and, when allowed, "Изменить". */
export function UserActionBar({ canEdit }: UserActionBarProps) {
  const { serverRunning } = useThreadActions()
  const localRunning = useAuiState((s) => s.thread.isRunning)
  const copied = useAuiState((s) => s.message.isCopied)
  const running = localRunning || serverRunning

  return (
    <ActionBarPrimitive.Root className="flex items-center gap-1 self-end">
      <ActionBarPrimitive.Copy copiedDuration={2000} className={ACTION}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        Копировать
      </ActionBarPrimitive.Copy>
      {canEdit && (
        <ActionBarPrimitive.Edit disabled={running} className={cn(ACTION)}>
          <Pencil size={14} />
          Изменить
        </ActionBarPrimitive.Edit>
      )}
    </ActionBarPrimitive.Root>
  )
}
