import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renders the label for every status variant', () => {
    const variants = ['neutral', 'brand', 'info', 'success', 'warning'] as const
    render(
      <>
        {variants.map((v) => (
          <Badge key={v} variant={v}>
            {v}
          </Badge>
        ))}
      </>,
    )
    for (const v of variants) expect(screen.getByText(v)).toBeTruthy()
  })

  it('renders the status dot as decorative', () => {
    const { container } = render(<Badge dot>Готово</Badge>)
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})
