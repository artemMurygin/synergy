import { render, screen } from '@testing-library/react'
import { describedBy } from '../test-utils'
import { describe, expect, it } from 'vitest'
import { Input } from './Input'

describe('Input', () => {
  it('links the error text via aria-describedby and marks invalid', () => {
    render(<Input aria-label="Логин" error="Обязательное поле" />)
    const input = screen.getByRole('textbox', { name: 'Логин' })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(describedBy(input)).toBe('Обязательное поле')
  })

  it('has no description and is valid without error', () => {
    render(<Input aria-label="Логин" />)
    const input = screen.getByRole('textbox', { name: 'Логин' })
    expect(input.getAttribute('aria-invalid')).not.toBe('true')
    expect(input.getAttribute('aria-describedby')).toBeNull()
  })

  it('keeps an external aria-describedby together with the error', () => {
    render(
      <>
        <span id="hint">Подсказка</span>
        <Input aria-label="Логин" aria-describedby="hint" error="Ошибка" />
      </>,
    )
    expect(describedBy(screen.getByRole('textbox'))).toBe('Подсказка Ошибка')
  })
})
