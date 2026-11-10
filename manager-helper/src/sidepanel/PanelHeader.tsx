import type { ReactNode, Ref } from 'react'
import { PlusIcon, SettingsIcon } from './icons'

interface Props {
  /** Section switch; omitted while the tasks are unavailable (no session). */
  switcher?: ReactNode
  /** Accessible name of the create button: "Новый чат" or "Новая задача". */
  actionLabel: string
  onAction: () => void
  actionDisabled?: boolean
  /** Set when the action opens an inline form (quick task create). */
  actionExpanded?: boolean
  onOpenSettings: () => void
  /** The create button, to return focus to it after a modal create form closes. */
  actionRef?: Ref<HTMLButtonElement>
}

const iconButton =
  'flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface-alt disabled:text-ink-40 disabled:hover:bg-transparent'

/** Panel header shared by the chat and the tasks: section switch, create action, settings. */
export function PanelHeader({
  switcher,
  actionLabel,
  onAction,
  actionDisabled,
  actionExpanded,
  onOpenSettings,
  actionRef,
}: Props) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
      {switcher}
      <span className="flex-1" />
      <button
        ref={actionRef}
        type="button"
        aria-label={actionLabel}
        aria-expanded={actionExpanded}
        className={`${iconButton} text-brand-red`}
        disabled={actionDisabled}
        onClick={onAction}
      >
        <PlusIcon />
      </button>
      <button
        type="button"
        aria-label="Настройки"
        className={`${iconButton} text-ink-60`}
        onClick={onOpenSettings}
      >
        <SettingsIcon />
      </button>
    </header>
  )
}
