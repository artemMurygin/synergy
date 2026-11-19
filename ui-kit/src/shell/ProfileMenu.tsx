import { useState, type ReactNode } from 'react'
import { ChevronRight, KeyRound, LogOut } from '../icons'
import { cn } from '../lib/cn'
import { useLayoutMode } from '../layout/layout-mode'
import { Button } from '../primitives/Button'
import { Dialog, DialogContent } from '../primitives/Dialog'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../primitives/Menu'
import { Sheet, SheetContent } from '../primitives/Sheet'
import { TelegramMenuItem } from '../telegram/TelegramMenuItem'
import { ProfileButton, initialsOf } from './ProfileButton'

export type ProfileMenuProps = {
  user: { name: string; login?: string }
  /** Нет `telegram` — пункт скрыт. */
  telegram?: { label: string }
  onTelegram: () => void
  onChangePassword: () => void
  onLogout: () => void
  /** Пункты приложения между «Сменить пароль» и «Выйти» (например, «Настройки расширения» в MH). */
  extraItems?: ProfileMenuExtraItem[]
}

export type ProfileMenuExtraItem = {
  id: string
  label: string
  icon?: ReactNode
  onSelect: () => void
}

function Identity({ name, login }: { name: string; login?: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[15px] font-semibold text-ink-80">
        {initialsOf(name)}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold text-ink">{name}</span>
        <span className="truncate text-xs text-ink-60">
          {login ? `${login} · Вы вошли в систему` : 'Вы вошли в систему'}
        </span>
      </div>
    </div>
  )
}

const rowClass =
  'flex h-11 w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 text-left text-sm font-medium text-ink outline-none hover:bg-surface-alt focus-visible:bg-surface-alt data-[highlighted]:bg-surface-alt'

function RowContent({ icon, label, danger }: { icon: ReactNode; label: string; danger?: boolean }) {
  return (
    <>
      {icon}
      <span className="flex-1">{label}</span>
      {danger ? null : <ChevronRight size={16} className="text-ink-40" />}
    </>
  )
}

/** Кнопка профиля и меню: popover рядом с кнопкой (desktop/tablet) или нижняя шторка (mobile). Выход — с подтверждением. */
export function ProfileMenu({
  user,
  telegram,
  onTelegram,
  onChangePassword,
  onLogout,
  extraItems = [],
}: ProfileMenuProps) {
  const mode = useLayoutMode()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const confirm = (
    <LogoutConfirm
      mode={mode}
      open={confirmOpen}
      login={user.login ?? user.name}
      onOpenChange={setConfirmOpen}
      onConfirm={() => {
        setConfirmOpen(false)
        onLogout()
      }}
    />
  )

  if (mode === 'mobile') {
    const pick = (fn: () => void) => () => {
      setSheetOpen(false)
      fn()
    }
    return (
      <>
        <ProfileButton
          name={user.name}
          onClick={() => {
            setSheetOpen(true)
          }}
        />
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" title="Профиль" className="pb-4">
            <Identity name={user.name} login={user.login} />
            <MenuSeparator />
            {telegram ? (
              <TelegramMenuItem status={telegram.label} onClick={pick(onTelegram)} />
            ) : null}
            <button type="button" className={rowClass} onClick={pick(onChangePassword)}>
              <RowContent icon={<KeyRound className="text-ink-80" />} label="Сменить пароль" />
            </button>
            {extraItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={rowClass}
                onClick={pick(item.onSelect)}
              >
                <RowContent icon={item.icon} label={item.label} />
              </button>
            ))}
            <MenuSeparator />
            <button
              type="button"
              className={cn(rowClass, 'text-brand-red')}
              onClick={pick(() => {
                setConfirmOpen(true)
              })}
            >
              <RowContent danger icon={<LogOut className="text-brand-red" />} label="Выйти" />
            </button>
          </SheetContent>
        </Sheet>
        {confirm}
      </>
    )
  }

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <ProfileButton name={user.name} />
        </MenuTrigger>
        <MenuContent side="right" align="end" className="w-72 rounded-xl p-2">
          <Identity name={user.name} login={user.login} />
          <MenuSeparator />
          {telegram ? (
            <MenuItem asChild onSelect={onTelegram}>
              <TelegramMenuItem status={telegram.label} />
            </MenuItem>
          ) : null}
          <MenuItem className={rowClass} onSelect={onChangePassword}>
            <RowContent icon={<KeyRound className="text-ink-80" />} label="Сменить пароль" />
          </MenuItem>
          {extraItems.map((item) => (
            <MenuItem key={item.id} className={rowClass} onSelect={item.onSelect}>
              <RowContent icon={item.icon} label={item.label} />
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            className={cn(rowClass, 'text-brand-red')}
            onSelect={() => {
              setConfirmOpen(true)
            }}
          >
            <RowContent danger icon={<LogOut className="text-brand-red" />} label="Выйти" />
          </MenuItem>
        </MenuContent>
      </Menu>
      {confirm}
    </>
  )
}

type LogoutConfirmProps = {
  mode: ReturnType<typeof useLayoutMode>
  open: boolean
  login: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

function LogoutConfirm({ mode, open, login, onOpenChange, onConfirm }: LogoutConfirmProps) {
  const title = 'Выйти из аккаунта?'
  const description = `Вы выйдете из аккаунта ${login} на этом устройстве. Чаты и задачи сохранятся — чтобы вернуться, войдите снова по логину и паролю.`
  const footer = (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          onOpenChange(false)
        }}
      >
        Отмена
      </Button>
      <Button onClick={onConfirm}>Выйти</Button>
    </>
  )
  if (mode === 'mobile') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" title={title} description={description} footer={footer} />
      </Sheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        footer={footer}
        className="max-w-[440px]"
      />
    </Dialog>
  )
}
