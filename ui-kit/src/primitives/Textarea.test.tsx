import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describedBy } from '../test-utils'
import { describe, expect, it } from 'vitest'
import { Textarea } from './Textarea'

describe('Textarea', () => {
  it('accepts typing', async () => {
    render(<Textarea aria-label="Описание" />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Описание' }), 'привет')
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('привет')
  })

  it('links the error text', () => {
    render(<Textarea aria-label="Описание" error="Нельзя пусто" />)
    const el = screen.getByRole('textbox')
    expect(el.getAttribute('aria-invalid')).toBe('true')
    expect(describedBy(el)).toBe('Нельзя пусто')
  })
})
