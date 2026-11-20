import { useId, useState, type SubmitEvent, type ReactNode } from 'react'
import { useLayoutMode } from '../layout/layout-mode'
import { Button } from '../primitives/Button'
import { Dialog, DialogContent } from '../primitives/Dialog'
import { PasswordField } from '../primitives/PasswordField'
import { Sheet, SheetClose, SheetContent } from '../primitives/Sheet'
import { X } from '../icons'
import { PasswordChangedScreen } from './PasswordChangedScreen'
import { AUTH_RETRY_HINT, AuthAlert, AuthField, AuthHeading, AuthScreen } from './AuthScreen'

export const PASSWORD_RULE = 'Не короче 10 символов, буква и цифра'

export function isValidNewPassword(value: string): boolean {
  return value.length >= 10 && /\p{L}/u.test(value) && /\d/.test(value)
}

export type ChangePasswordDialogProps = {
  /** `forced` — обязательная смена при временном пароле (нельзя закрыть); `voluntary` — из меню профиля. */
  kind: 'forced' | 'voluntary'
  /** Только для `voluntary`. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSubmit: (passwords: { currentPassword: string; newPassword: string }) => void
  error?: string
  pending: boolean
  /** Только для `voluntary`: пароль изменён, показать экран успеха. */
  success?: boolean
  /** Для `forced`: «Выйти» вместо отмены. */
  onLogout?: () => void
}

type Errors = { current?: string; next?: string; repeat?: string }

/** Смена пароля: обязательная (экран без закрытия, IDTFu) и добровольная (диалог или нижняя шторка по режиму, kW2AT). */
export function ChangePasswordDialog({ kind, open = true, onOpenChange, onSubmit, error, pending, success = false, onLogout }: ChangePasswordDialogProps) {
  const mode = useLayoutMode()
  const formId = useId()
  const ids = { current: useId(), next: useId(), repeat: useId() }
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const forced = kind === 'forced'

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found: Errors = {
      current: current ? undefined : forced ? 'Введите временный пароль' : 'Введите текущий пароль',
      next: !next ? 'Введите новый пароль' : isValidNewPassword(next) ? undefined : PASSWORD_RULE,
      repeat: !repeat ? 'Повторите новый пароль' : repeat === next ? undefined : 'Пароли не совпадают',
    }
    setErrors(found)
    if (found.current || found.next || found.repeat) return
    onSubmit({ currentPassword: current, newPassword: next })
  }

  const form = (
    <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-3.5">
      {error ? <AuthAlert title={error} hint={AUTH_RETRY_HINT} /> : null}
      <AuthField label={forced ? 'Временный пароль' : 'Текущий пароль'} htmlFor={ids.current}>
        <PasswordField
          id={ids.current}
          autoComplete="current-password"
          disabled={pending}
          value={current}
          error={errors.current}
          onChange={(e) => {
            setCurrent(e.target.value)
          }}
        />
      </AuthField>
      <AuthField label="Новый пароль" htmlFor={ids.next} hint={errors.next ? undefined : PASSWORD_RULE}>
        <PasswordField
          id={ids.next}
          autoComplete="new-password"
          disabled={pending}
          value={next}
          error={errors.next}
          onChange={(e) => {
            setNext(e.target.value)
          }}
        />
      </AuthField>
      <AuthField label="Повторите новый пароль" htmlFor={ids.repeat}>
        <PasswordField
          id={ids.repeat}
          autoComplete="new-password"
          disabled={pending}
          value={repeat}
          error={errors.repeat}
          onChange={(e) => {
            setRepeat(e.target.value)
          }}
        />
      </AuthField>
    </form>
  )

  const submitLabel = pending ? 'Сохраняем…' : forced ? 'Сменить пароль' : 'Сохранить пароль'

  if (forced) {
    return (
      <AuthScreen>
        <AuthHeading title="Смена временного пароля" subtitle="Вы вошли с временным паролем. Задайте свой, чтобы продолжить работу." />
        {form}
        <div className="flex flex-col gap-2">
          <Button type="submit" form={formId} disabled={pending} className="w-full rounded-full">
            {submitLabel}
          </Button>
          {onLogout ? (
            <Button variant="ghost" disabled={pending} onClick={onLogout} className="h-12 w-full rounded-full">
              Выйти
            </Button>
          ) : null}
        </div>
      </AuthScreen>
    )
  }

  const description = 'После смены пароля все другие сеансы будут завершены.'
  const close = () => {
    onOpenChange?.(false)
  }

  if (mode === 'mobile') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" aria-label="Смена пароля" className="pb-4">
          {success ? (
            <PasswordChangedScreen onContinue={close} />
          ) : (
            <>
              <div className="flex items-start gap-2">
                <div className="flex flex-1 flex-col gap-1">
                  <h2 className="font-display text-xl font-bold text-ink">Смена пароля</h2>
                  <p className="text-sm text-ink-60">{description}</p>
                </div>
                <SheetClose
                  aria-label="Закрыть"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-80 outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-brand-red/40"
                >
                  <X />
                </SheetClose>
              </div>
              {form}
              <div className="flex flex-col gap-2">
                <Button type="submit" form={formId} disabled={pending} className="w-full rounded-full">
                  {submitLabel}
                </Button>
                <Button variant="secondary" disabled={pending} onClick={close} className="w-full rounded-full">
                  Отмена
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    )
  }

  const footer: ReactNode = (
    <>
      <Button variant="secondary" disabled={pending} onClick={close}>
        Отмена
      </Button>
      <Button type="submit" form={formId} disabled={pending}>
        {submitLabel}
      </Button>
    </>
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Смена пароля" description={success ? undefined : description} footer={success ? undefined : footer}>
        {success ? <PasswordChangedScreen onContinue={close} /> : form}
      </DialogContent>
    </Dialog>
  )
}
