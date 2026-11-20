import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthAlert } from './AuthScreen'

describe('AuthAlert', () => {
  it('shows title and hint as two lines', () => {
    render(<AuthAlert title="Неверный логин или пароль" hint="Проверьте данные и попробуйте снова." />)
    const alert = screen.getByRole('alert')
    expect(screen.getByText('Неверный логин или пароль')).toBeTruthy()
    expect(screen.getByText('Проверьте данные и попробуйте снова.')).toBeTruthy()
    expect(alert.querySelectorAll('p')).toHaveLength(2)
  })

  it('renders only the title without a hint', () => {
    render(<AuthAlert title="Ошибка" />)
    expect(screen.getByRole('alert').querySelectorAll('p')).toHaveLength(1)
  })
})
