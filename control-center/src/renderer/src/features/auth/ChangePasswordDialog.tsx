import { useId, useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { AuthErrorCode } from './auth.api'

export interface ChangePasswordDialogError {
  code: AuthErrorCode
}

export interface ChangePasswordDialogProps {
  onSubmit: (currentPassword: string, newPassword: string) => void
  onLogout: () => void
  isSubmitting: boolean
  error: ChangePasswordDialogError | null
}

type LocalError = 'SAME_PASSWORD' | 'MISMATCH' | null

const SAME_PASSWORD_TEXT = 'Новый пароль должен отличаться от текущего'

interface FieldProps {
  label: string
  name: string
  autoComplete: string
  value: string
  isDisabled: boolean
  errorText: string | null
  onChange: (value: string) => void
}

function PasswordField({ label, name, autoComplete, value, isDisabled, errorText, onChange }: FieldProps) {
  const inputId = useId()
  const errorId = useId()
  const hasError = errorText !== null
  const [isVisible, setIsVisible] = useState(false)
  const toggleLabel = `${isVisible ? 'Скрыть' : 'Показать'} ${label.toLowerCase()}`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[13px] font-semibold leading-[15px] text-ink">
        {label}
      </label>
      <div className="relative">
        <Input
          id={inputId}
          name={name}
          type={isVisible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          disabled={isDisabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={cn('h-[52px] rounded-md border-border-strong pl-4 pr-11 text-[15px]', hasError && 'border-brand-red')}
        />
        <button
          type="button"
          aria-label={toggleLabel}
          disabled={isDisabled}
          onClick={() => setIsVisible((current) => !current)}
          className="absolute inset-y-0 right-4 flex items-center text-ink-60"
        >
          {isVisible ? <EyeOff aria-hidden className="size-[18px]" /> : <Eye aria-hidden className="size-[18px]" />}
        </button>
      </div>
      {hasError ? (
        <p id={errorId} className="text-xs font-semibold leading-[14px] text-brand-red">
          {errorText}
        </p>
      ) : null}
    </div>
  )
}

function resolveCurrentError(error: ChangePasswordDialogError | null): string | null {
  return error?.code === 'WRONG_PASSWORD' ? 'Неверный текущий пароль' : null
}

function resolveNewError(error: ChangePasswordDialogError | null, localError: LocalError): string | null {
  if (localError === 'SAME_PASSWORD') return SAME_PASSWORD_TEXT
  if (error?.code === 'SAME_PASSWORD') return SAME_PASSWORD_TEXT
  if (error?.code === 'WEAK_PASSWORD') return 'Пароль слишком простой'
  return null
}

function isGenericError(error: ChangePasswordDialogError | null): boolean {
  if (error === null) return false
  return !['WRONG_PASSWORD', 'SAME_PASSWORD', 'WEAK_PASSWORD'].includes(error.code)
}

export function ChangePasswordDialog({ onSubmit, onLogout, isSubmitting, error }: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [localError, setLocalError] = useState<LocalError>(null)
  const hasInput = currentPassword !== '' && newPassword !== '' && repeatPassword !== ''
  const canSubmit = hasInput && !isSubmitting

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    if (newPassword === currentPassword) {
      setLocalError('SAME_PASSWORD')
      return
    }
    if (newPassword !== repeatPassword) {
      setLocalError('MISMATCH')
      return
    }
    setLocalError(null)
    onSubmit(currentPassword, newPassword)
  }

  return (
    <div className="flex min-h-full w-full items-center justify-center bg-surface-alt p-8">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        onSubmit={handleSubmit}
        noValidate
        className="flex w-full max-w-[460px] flex-col gap-6 rounded-lg border bg-surface p-[31px]"
      >
        <div className="flex flex-col gap-2">
          <h1 id="change-password-title" className="font-display text-[22px] font-bold leading-7 text-ink">
            Смена временного пароля
          </h1>
          <p className="text-sm leading-[1.4] text-ink-60">
            Вы вошли с временным паролем. Задайте свой, чтобы продолжить работу.
          </p>
        </div>

        {isGenericError(error) ? (
          <p role="alert" className="text-xs font-semibold text-brand-red">
            Не удалось сменить пароль. Попробуйте ещё раз.
          </p>
        ) : null}

        <div className="flex flex-col gap-4">
          <PasswordField
            label="Текущий пароль"
            name="currentPassword"
            autoComplete="current-password"
            value={currentPassword}
            isDisabled={isSubmitting}
            errorText={resolveCurrentError(error)}
            onChange={setCurrentPassword}
          />
          <PasswordField
            label="Новый пароль"
            name="newPassword"
            autoComplete="new-password"
            value={newPassword}
            isDisabled={isSubmitting}
            errorText={resolveNewError(error, localError)}
            onChange={setNewPassword}
          />
          <PasswordField
            label="Повторите новый пароль"
            name="repeatPassword"
            autoComplete="new-password"
            value={repeatPassword}
            isDisabled={isSubmitting}
            errorText={localError === 'MISMATCH' ? 'Пароли не совпадают' : null}
            onChange={setRepeatPassword}
          />
        </div>

        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            disabled={!canSubmit}
            className="h-12 w-full rounded-lg px-6 text-[15px] font-semibold shadow-[0_8px_4px_rgba(102,0,0,0.2)]"
          >
            Сменить пароль
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onLogout}
            className="h-12 w-full rounded-lg border-border-strong bg-surface px-6 text-[15px] font-semibold text-ink shadow-none"
          >
            Выйти
          </Button>
        </div>
      </form>
    </div>
  )
}
