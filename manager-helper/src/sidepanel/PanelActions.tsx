import { PanelHeaderButton } from '@synergy/ui-kit'
import { Plus, Settings } from '@synergy/ui-kit/icons'
import type { ReactNode, Ref } from 'react'

interface Props {
  /** Accessible name of the create button: "Новый чат" or "Новая задача". */
  actionLabel: string
  onAction: () => void
  actionDisabled?: boolean
  /** Set when the action opens an inline form (quick task create). */
  actionExpanded?: boolean
  /** The create button, to return focus to it after a modal create form closes. */
  actionRef?: Ref<HTMLButtonElement>
  onOpenSettings: () => void
  /** Notifications and profile in the top bar of a narrow panel (the rail carries them otherwise). */
  trailing?: ReactNode
}

/** Content of the package `PanelHeader` actions capsule shared by the chat and the tasks. */
export function PanelActions({
  actionLabel,
  onAction,
  actionDisabled,
  actionExpanded,
  actionRef,
  onOpenSettings,
  trailing,
}: Props) {
  return (
    <>
      <PanelHeaderButton
        ref={actionRef}
        label={actionLabel}
        icon={<Plus />}
        tone="primary"
        aria-expanded={actionExpanded}
        disabled={actionDisabled}
        onClick={onAction}
      />
      <PanelHeaderButton label="Настройки" icon={<Settings />} onClick={onOpenSettings} />
      {trailing}
    </>
  )
}
