import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describedBy } from '../test-utils'
import { describe, expect, it } from 'vitest'
import { PasswordField } from './PasswordField'

describe('PasswordField', () => {
  it('hides the password by default and toggles visibility', async () => {
    render(<PasswordField aria-label="Пароль" defaultValue="secret" />)
    const input = screen.getByLabelText('Пароль')
    expect(input.getAttribute('type')).toBe('password')

    await userEvent.click(screen.getByRole('button', { name: 'Показать пароль' }))
    expect(input.getAttribute('type')).toBe('text')

    await userEvent.click(screen.getByRole('button', { name: 'Скрыть пароль' }))
    expect(input.getAttribute('type')).toBe('password')
  })

  it('shows the error linked to the field', () => {
    render(<PasswordField aria-label="Пароль" error="Слишком короткий" />)
    expect(describedBy(screen.getByLabelText('Пароль'))).toBe('Слишком короткий')
  })
})
