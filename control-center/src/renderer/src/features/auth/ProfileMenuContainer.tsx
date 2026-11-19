import { useQuery } from '@tanstack/react-query'
import { ChangePasswordDialog, ProfileMenu } from '@synergy/ui-kit'
import { useState } from 'react'
import { TelegramDialog } from '@/features/telegram/TelegramDialog'
import { telegramStatusLabel } from '@/features/telegram/telegram-format'
import { telegramLinkQuery } from '@/lib/backend/telegram.queries'
import { changePasswordErrorText } from './auth-messages'
import { useChangePassword } from './use-change-password'
import { useLogout } from './use-logout'
import { useSessionStore } from './session.store'

// Profile button and menu of the rail (frames TLMEl, txD2J): Telegram, change password, logout with confirmation
export function ProfileMenuContainer() {
  const login = useSessionStore((store) => store.snapshot.user?.login)
  const logout = useLogout()
  const changePassword = useChangePassword()
  const { data: telegramStatus } = useQuery(telegramLinkQuery())
  const [isTelegramOpen, setTelegramOpen] = useState(false)
  const [isPasswordOpen, setPasswordOpen] = useState(false)
  if (!login) return null

  const closePassword = (): void => {
    setPasswordOpen(false)
    changePassword.reset()
  }

  return (
    <>
      <ProfileMenu
        user={{ name: login, login }}
        telegram={telegramStatus?.isAvailable ? { label: telegramStatusLabel(telegramStatus) } : undefined}
        onTelegram={() => setTelegramOpen(true)}
        onChangePassword={() => setPasswordOpen(true)}
        onLogout={() => logout.mutate()}
      />
      <TelegramDialog open={isTelegramOpen} onOpenChange={setTelegramOpen} />
      {isPasswordOpen ? (
        <ChangePasswordDialog
          kind="voluntary"
          open
          onOpenChange={(open) => {
            if (!open) closePassword()
          }}
          pending={changePassword.isPending}
          error={changePasswordErrorText(changePassword.error)}
          onSubmit={({ currentPassword, newPassword }) =>
            changePassword.mutate(
              { currentPassword, newPassword, confirmPassword: newPassword },
              { onSuccess: closePassword }
            )
          }
        />
      ) : null}
    </>
  )
}
