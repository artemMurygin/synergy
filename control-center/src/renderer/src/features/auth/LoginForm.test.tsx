import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from './LoginForm'

function getSubmitButton(): HTMLButtonElement {
  const buttons = screen.getAllByRole('button')
  const submit = buttons.find((button) => button instanceof HTMLButtonElement && button.type === 'submit')
  if (!(submit instanceof HTMLButtonElement)) throw new Error('submit button not found')
  return submit
}

function getInput(label: string): HTMLInputElement {
  const input = screen.getByLabelText(label)
  if (!(input instanceof HTMLInputElement)) throw new Error(`input ${label} not found`)
  return input
}

function fillForm(login: string, password: string): void {
  fireEvent.change(getInput('Логин'), { target: { value: login } })
  fireEvent.change(getInput('Пароль'), { target: { value: password } })
}

describe('LoginForm', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders heading, caption, empty fields and a disabled submit button', () => {
    render(<LoginForm onSubmit={vi.fn()} isSubmitting={false} error={null} />)
    expect(screen.getByRole('heading', { name: 'Вход в Control Center' })).toBeTruthy()
    expect(screen.getByText('Введите логин и пароль, которые выдал администратор.')).toBeTruthy()
    expect(getInput('Логин').value).toBe('')
    expect(getInput('Пароль').value).toBe('')
    expect(getInput('Пароль').type).toBe('password')
    expect(getSubmitButton().textContent).toBe('Войти')
    expect(getSubmitButton().disabled).toBe(true)
  })

  it('calls onSubmit with login and password', () => {
    const onSubmit = vi.fn()
    render(<LoginForm onSubmit={onSubmit} isSubmitting={false} error={null} />)
    fillForm('admin', 'secret')
    expect(getSubmitButton().disabled).toBe(false)
    fireEvent.click(getSubmitButton())
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('admin', 'secret')
  })

  it.each([
    ['login is empty', '', 'secret'],
    ['password is empty', 'admin', ''],
    ['login is blank', '   ', 'secret']
  ])('keeps submit disabled and does not submit when %s', (_name, login, password) => {
    const onSubmit = vi.fn()
    render(<LoginForm onSubmit={onSubmit} isSubmitting={false} error={null} />)
    fillForm(login, password)
    expect(getSubmitButton().disabled).toBe(true)
    fireEvent.submit(getSubmitButton())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('disables the submit button and fields while submitting', () => {
    const onSubmit = vi.fn()
    const { rerender } = render(<LoginForm onSubmit={onSubmit} isSubmitting={false} error={null} />)
    fillForm('admin', 'secret')
    rerender(<LoginForm onSubmit={onSubmit} isSubmitting error={null} />)
    expect(getSubmitButton().disabled).toBe(true)
    expect(getInput('Логин').disabled).toBe(true)
    expect(getInput('Пароль').disabled).toBe(true)
    fireEvent.submit(getSubmitButton())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the invalid credentials error under the password field', () => {
    render(<LoginForm onSubmit={vi.fn()} isSubmitting={false} error={{ code: 'INVALID_CREDENTIALS' }} />)
    const message = screen.getByText('Неверный логин или пароль')
    expect(message).toBeTruthy()
    expect(getInput('Пароль').getAttribute('aria-invalid')).toBe('true')
    expect(getInput('Логин').getAttribute('aria-invalid')).not.toBe('true')
    const passwordField = getInput('Пароль').parentElement?.parentElement
    expect(passwordField?.contains(message)).toBe(true)
  })

  it('shows no error text without an error', () => {
    render(<LoginForm onSubmit={vi.fn()} isSubmitting={false} error={null} />)
    expect(screen.queryByText('Неверный логин или пароль')).toBeNull()
    expect(screen.queryByText('Слишком много попыток входа')).toBeNull()
  })

  it('shows the warning notice above the form', () => {
    render(
      <LoginForm
        onSubmit={vi.fn()}
        isSubmitting={false}
        error={null}
        warning="Сервер недоступен, сессия на сервере не отозвана."
      />
    )
    const title = screen.getByText('Выход выполнен только на этом компьютере')
    const text = screen.getByText('Сервер недоступен, сессия на сервере не отозвана.')
    expect(title).toBeTruthy()
    expect(text).toBeTruthy()
    const loginInput = getInput('Логин')
    expect(title.compareDocumentPosition(loginInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(getSubmitButton().textContent).toBe('Войти')
  })

  it('does not show the warning notice without warning', () => {
    render(<LoginForm onSubmit={vi.fn()} isSubmitting={false} error={null} />)
    expect(screen.queryByText('Выход выполнен только на этом компьютере')).toBeNull()
  })

  describe('rate limit countdown', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('locks the form and shows the countdown from the retryAfterSec prop', () => {
      render(<LoginForm onSubmit={vi.fn()} isSubmitting={false} error={null} retryAfterSec={42} />)
      expect(screen.getByText('Слишком много попыток входа')).toBeTruthy()
      expect(screen.getByText('Повторите через 42 с. Форма разблокируется автоматически.')).toBeTruthy()
      expect(getSubmitButton().textContent).toBe('Повторить через 42 с')
      expect(getSubmitButton().disabled).toBe(true)
      expect(getInput('Логин').disabled).toBe(true)
      expect(getInput('Пароль').disabled).toBe(true)
    })

    it('uses retryAfterSec from a RATE_LIMITED error', () => {
      render(
        <LoginForm
          onSubmit={vi.fn()}
          isSubmitting={false}
          error={{ code: 'RATE_LIMITED', retryAfterSec: 30 }}
        />
      )
      expect(getSubmitButton().textContent).toBe('Повторить через 30 с')
      expect(getSubmitButton().disabled).toBe(true)
      expect(screen.queryByText('Неверный логин или пароль')).toBeNull()
    })

    it('counts down every second and unlocks after zero', () => {
      const onSubmit = vi.fn()
      render(<LoginForm onSubmit={onSubmit} isSubmitting={false} error={null} retryAfterSec={3} />)
      expect(getSubmitButton().textContent).toBe('Повторить через 3 с')
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(getSubmitButton().textContent).toBe('Повторить через 2 с')
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(getSubmitButton().textContent).toBe('Повторить через 1 с')
      expect(getInput('Логин').disabled).toBe(true)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(getSubmitButton().textContent).toBe('Войти')
      expect(screen.queryByText('Слишком много попыток входа')).toBeNull()
      expect(getInput('Логин').disabled).toBe(false)
      expect(getInput('Пароль').disabled).toBe(false)
      fillForm('admin', 'secret')
      expect(getSubmitButton().disabled).toBe(false)
      fireEvent.click(getSubmitButton())
      expect(onSubmit).toHaveBeenCalledWith('admin', 'secret')
    })

    it('does not submit while locked', () => {
      const onSubmit = vi.fn()
      render(<LoginForm onSubmit={onSubmit} isSubmitting={false} error={null} retryAfterSec={10} />)
      fireEvent.submit(getSubmitButton())
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('restarts the countdown when a new retryAfterSec arrives', () => {
      const { rerender } = render(
        <LoginForm onSubmit={vi.fn()} isSubmitting={false} error={null} retryAfterSec={2} />
      )
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(getSubmitButton().textContent).toBe('Войти')
      rerender(
        <LoginForm
          onSubmit={vi.fn()}
          isSubmitting={false}
          error={{ code: 'RATE_LIMITED', retryAfterSec: 5 }}
        />
      )
      expect(getSubmitButton().textContent).toBe('Повторить через 5 с')
      expect(getSubmitButton().disabled).toBe(true)
    })

    it('stops the timer on unmount', () => {
      const { unmount } = render(
        <LoginForm onSubmit={vi.fn()} isSubmitting={false} error={null} retryAfterSec={5} />
      )
      unmount()
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('hides the caption while a notice is shown', () => {
    render(<LoginForm onSubmit={vi.fn()} isSubmitting={false} error={null} warning="Сервер недоступен" />)
    expect(screen.queryByText('Введите логин и пароль, которые выдал администратор.')).toBeNull()
    expect(screen.getByText('Сервер недоступен')).toBeTruthy()
  })
})
