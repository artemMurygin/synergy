import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChangePasswordDialog } from './ChangePasswordDialog'

function getInput(label: string): HTMLInputElement {
  const input = screen.getByLabelText(label)
  if (!(input instanceof HTMLInputElement)) throw new Error(`input ${label} not found`)
  return input
}

function fillForm(current: string, next: string, repeat: string): void {
  fireEvent.change(getInput('Текущий пароль'), { target: { value: current } })
  fireEvent.change(getInput('Новый пароль'), { target: { value: next } })
  fireEvent.change(getInput('Повторите новый пароль'), { target: { value: repeat } })
}

function renderDialog(props: Partial<Parameters<typeof ChangePasswordDialog>[0]> = {}) {
  const onSubmit = vi.fn()
  const onLogout = vi.fn()
  render(
    <ChangePasswordDialog
      onSubmit={onSubmit}
      onLogout={onLogout}
      isSubmitting={false}
      error={null}
      {...props}
    />
  )
  return { onSubmit, onLogout }
}

describe('ChangePasswordDialog', () => {
  afterEach(cleanup)

  it('renders three password fields and both buttons', () => {
    renderDialog()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(getInput('Текущий пароль').type).toBe('password')
    expect(getInput('Новый пароль').type).toBe('password')
    expect(getInput('Повторите новый пароль').type).toBe('password')
    expect(screen.getByRole('button', { name: 'Сменить пароль' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeTruthy()
  })

  it('renders the frame title and caption', () => {
    renderDialog()
    expect(screen.getByRole('heading', { name: 'Смена временного пароля' })).toBeTruthy()
    expect(
      screen.getByText('Вы вошли с временным паролем. Задайте свой, чтобы продолжить работу.')
    ).toBeTruthy()
  })

  it('renders a visibility toggle in every field', () => {
    renderDialog()
    expect(screen.getAllByRole('button', { name: /Показать/ })).toHaveLength(3)
  })

  it('reveals only the field whose toggle was pressed', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Показать новый пароль' }))
    expect(getInput('Новый пароль').type).toBe('text')
    expect(getInput('Текущий пароль').type).toBe('password')
    expect(screen.getByRole('button', { name: 'Скрыть новый пароль' })).toBeTruthy()
  })

  it('submits current and new password when valid', () => {
    const { onSubmit } = renderDialog()
    fillForm('old-secret', 'new-secret', 'new-secret')
    fireEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('old-secret', 'new-secret')
  })

  it('keeps submit disabled while a field is empty', () => {
    const { onSubmit } = renderDialog()
    fillForm('old-secret', 'new-secret', '')
    const button = screen.getByRole('button', { name: 'Сменить пароль' })
    expect(button instanceof HTMLButtonElement && button.disabled).toBe(true)
    fireEvent.submit(getInput('Новый пароль'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows mismatch error under the repeat field without calling onSubmit', () => {
    const { onSubmit } = renderDialog()
    fillForm('old-secret', 'new-secret', 'other-secret')
    fireEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }))
    const message = screen.getByText('Пароли не совпадают')
    expect(getInput('Повторите новый пароль').parentElement?.parentElement?.contains(message)).toBe(true)
    expect(getInput('Повторите новый пароль').getAttribute('aria-invalid')).toBe('true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows same-password error under the new password field without calling onSubmit', () => {
    const { onSubmit } = renderDialog()
    fillForm('same-secret', 'same-secret', 'same-secret')
    fireEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }))
    const message = screen.getByText('Новый пароль должен отличаться от текущего')
    expect(getInput('Новый пароль').parentElement?.parentElement?.contains(message)).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('clears local errors after the input is corrected and resubmitted', () => {
    const { onSubmit } = renderDialog()
    fillForm('old-secret', 'new-secret', 'other-secret')
    fireEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }))
    fireEvent.change(getInput('Повторите новый пароль'), { target: { value: 'new-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }))
    expect(screen.queryByText('Пароли не совпадают')).toBeNull()
    expect(onSubmit).toHaveBeenCalledWith('old-secret', 'new-secret')
  })

  it.each([
    ['WRONG_PASSWORD', 'Неверный текущий пароль', 'Текущий пароль'],
    ['WEAK_PASSWORD', 'Пароль слишком простой', 'Новый пароль'],
    ['SAME_PASSWORD', 'Новый пароль должен отличаться от текущего', 'Новый пароль']
  ] as const)('shows server code %s under its field', (code, text, label) => {
    renderDialog({ error: { code } })
    const message = screen.getByText(text)
    expect(getInput(label).parentElement?.parentElement?.contains(message)).toBe(true)
  })

  it('shows no field errors without an error', () => {
    renderDialog()
    expect(screen.queryByText('Неверный текущий пароль')).toBeNull()
    expect(screen.queryByText('Пароль слишком простой')).toBeNull()
    expect(screen.queryByText('Пароли не совпадают')).toBeNull()
  })

  it('disables fields and submit while submitting', () => {
    renderDialog({ isSubmitting: true })
    expect(getInput('Текущий пароль').disabled).toBe(true)
    const button = screen.getByRole('button', { name: 'Сменить пароль' })
    expect(button instanceof HTMLButtonElement && button.disabled).toBe(true)
  })

  it('calls onLogout when Выйти is clicked', () => {
    const { onLogout } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('cannot be closed by Escape, backdrop click or a close button', () => {
    const { onLogout, onSubmit } = renderDialog()
    fireEvent.keyDown(getInput('Текущий пароль'), { key: 'Escape' })
    fireEvent.keyDown(document.body, { key: 'Escape' })
    const dialog = screen.getByRole('dialog')
    const backdrop = dialog.parentElement
    if (backdrop) fireEvent.click(backdrop)
    fireEvent.click(document.body)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /закрыть|close/i })).toBeNull()
    expect(onLogout).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
