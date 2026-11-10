import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TelegramDialog, TelegramMenuItem } from '@/features/telegram'
import { LogoutButton } from './LogoutButton'
import { useSessionStore } from './session.store'

export function AccountMenu() {
  const login = useSessionStore((store) => store.snapshot.user?.login)
  const [isMenuOpen, setMenuOpen] = useState(false)
  const [isTelegramOpen, setTelegramOpen] = useState(false)
  if (!login) return null

  const openTelegram = (): void => {
    setMenuOpen(false)
    setTelegramOpen(true)
  }

  return (
    <>
      <Popover open={isMenuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger
          aria-label={`Учётная запись ${login}`}
          title={login}
          className="flex size-9 items-center justify-center rounded-full bg-brand-red-soft text-xs font-semibold text-brand-red outline-none hover:ring-2 hover:ring-brand-red/30 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {login.slice(0, 2).toUpperCase()}
        </PopoverTrigger>
        <PopoverContent side="right" align="end" sideOffset={10} className="flex w-[280px] flex-col gap-1 p-2">
          <div className="flex items-center gap-3 p-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[13px] leading-[15px] font-semibold text-foreground">{login}</span>
              <span className="truncate text-xs leading-[14px] text-muted-foreground">Вы вошли в систему</span>
            </div>
            <LogoutButton />
          </div>
          <TelegramMenuItem onOpen={openTelegram} />
        </PopoverContent>
      </Popover>
      <TelegramDialog open={isTelegramOpen} onOpenChange={setTelegramOpen} />
    </>
  )
}

