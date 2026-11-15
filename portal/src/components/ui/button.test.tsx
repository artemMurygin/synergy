import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button } from './button'

afterEach(cleanup)

describe('Button · disabled tokens', () => {
  it('primary disabled: surface-sunken fill, ink-40 text, no red shadow, no opacity', () => {
    render(<Button disabled>Создаём…</Button>)
    const cls = screen.getByRole('button').className
    expect(cls).toContain('disabled:bg-surface-sunken')
    expect(cls).toContain('disabled:text-ink-40')
    expect(cls).toContain('disabled:shadow-none')
    expect(cls).not.toContain('disabled:opacity-50')
  })

  it('outline disabled: surface-alt fill, ink-40 text, border stays', () => {
    render(
      <Button variant="outline" disabled>
        Сохранить роли
      </Button>
    )
    const cls = screen.getByRole('button').className
    expect(cls).toContain('disabled:bg-surface-alt')
    expect(cls).toContain('disabled:text-ink-40')
    expect(cls).toContain('border-border-strong')
    expect(cls).not.toContain('disabled:opacity-50')
  })
})
