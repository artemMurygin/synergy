import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { changePassword, useSession } from '@/features/auth'
import { cn } from '@/lib/utils'
import { CardHead, CardScreen, Glyph, IconField } from '@/features/auth/ui/auth-ui'

interface Errors {
  current?: string
  next?: string
  repeat?: string
}

const MIN_LENGTH = 8

function Rule({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className={cn('flex items-center gap-2 text-[12px]', ok ? 'text-ink-80' : 'text-ink-60')}>
      <Glyph name={ok ? 'circle-check' : 'circle'} size={15} className={ok ? 'text-success' : 'text-ink-40'} />
      {children}
    </li>
  )
}

export function ChangePasswordPage() {
  const { status } = useSession()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const change = useMutation<unknown, Error, { current: string; next: string }>({
    mutationFn: (v) => changePassword(v.current, v.next)
  })

  if (status === 'signedIn' && change.isSuccess) return <Navigate to="/requests" replace />

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const e: Errors = {}
    if (!current) e.current = 'Введите временный пароль'
    if (!next) e.next = 'Введите новый пароль'
    else if (next.length < MIN_LENGTH) e.next = `Не короче ${String(MIN_LENGTH)} символов`
    else if (next === current) e.next = 'Новый пароль должен отличаться от временного'
    if (next && repeat !== next) e.repeat = 'Пароли не совпадают'
    setErrors(e)
    if (e.current || e.next || e.repeat) return
    change.mutate({ current, next })
  }

  return (
    <CardScreen className="gap-4">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <CardHead title="Смена временного пароля">Администратор выдал временный пароль. Задайте свой, чтобы продолжить.</CardHead>
        {change.isError ? <Alert>{change.error.message}</Alert> : null}
        <IconField
          label="Временный пароль"
          icon="lock"
          type="password"
          autoComplete="current-password"
          value={current}
          error={errors.current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <IconField
          label="Новый пароль"
          icon="lock"
          type="password"
          reveal
          autoComplete="new-password"
          value={next}
          error={errors.next}
          onChange={(e) => setNext(e.target.value)}
        />
        <ul aria-label="Требования к паролю" className="flex flex-col gap-1.5">
          <Rule ok={next.length >= MIN_LENGTH}>{`Не короче ${String(MIN_LENGTH)} символов`}</Rule>
          <Rule ok={next.length > 0 && next !== current}>Отличается от временного</Rule>
          <Rule ok={next.length > 0 && repeat === next}>Пароли совпадают</Rule>
        </ul>
        <IconField
          label="Повторите пароль"
          icon="lock"
          type="password"
          placeholder="Введите ещё раз"
          autoComplete="new-password"
          value={repeat}
          error={errors.repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
        <Button type="submit" disabled={change.isPending} className="w-full">
          {change.isPending ? 'Сохраняем…' : 'Сохранить и войти'}
        </Button>
      </form>
    </CardScreen>
  )
}
