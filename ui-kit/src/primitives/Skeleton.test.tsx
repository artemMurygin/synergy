import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Skeleton } from './Skeleton'

describe('Skeleton', () => {
  it('is hidden from assistive tech and passes className', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />)
    const el = container.firstElementChild
    expect(el?.getAttribute('aria-hidden')).toBe('true')
    expect(el?.className).toContain('h-4')
  })
})
