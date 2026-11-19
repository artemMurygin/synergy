import { ChangePasswordDialog, ProfileMenu } from '@synergy/ui-kit'
import { Settings } from '@synergy/ui-kit/icons'
import { useState } from 'react'
import type { TelegramLink, TelegramLinkState } from '@/options/telegram/use-telegram-link'
import { useAuthSession } from '@/shared/auth/use-auth-session'
import { passwordErrorText } from '@/shared/auth/ui/password-error'

interface Props {
  link: TelegramLink
  onOpenTelegram: () => void
}

/** Status next to "Telegram"; `null` hides the item (the bot is not configured on the server). */
function telegramLabel(state: TelegramLinkState): string | null {
  switch (state.kind) {
    case 'not-configured':
    case 'unavailable':
      return null
    case 'linked':
    case 'unlinking':
      return state.status.username === null ? 'Подключён' : `@${state.status.username}`
    case 'loading':
      return 'Загрузка…'
    default:
      return 'Не подключён'
  }
}

/** Profile menu of the panel: logout, password change, the Telegram entry and the extension settings. */
export function ProfileMenuContainer({ link, onOpenTelegram }: Props) {
  const session = useAuthSession()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const label = telegramLabel(link.state)

  const changePassword = async ({
    currentPassword,
    newPassword,
  }: {
    currentPassword: string
    newPassword: string
  }) => {
    setError(undefined)
    setPending(true)
    try {
      await session.changePassword(currentPassword, newPassword)
      setPasswordOpen(false)
    } catch (failure) {
      setError(passwordErrorText(failure, 'voluntary'))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <ProfileMenu
        user={{ name: session.user?.login ?? '', login: session.user?.login }}
        telegram={label === null ? undefined : { label }}
        onTelegram={onOpenTelegram}
        onChangePassword={() => {
          setError(undefined)
          setPasswordOpen(true)
        }}
        onLogout={() => void session.logout()}
        extraItems={[
          {
            id: 'extension-settings',
            label: 'Настройки расширения',
            icon: <Settings className="text-ink-80" />,
            onSelect: () => void chrome.runtime.openOptionsPage(),
          },
        ]}
      />
      <ChangePasswordDialog
        kind="voluntary"
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        onSubmit={(passwords) => void changePassword(passwords)}
        error={error}
        pending={pending}
      />
    </>
  )
}
