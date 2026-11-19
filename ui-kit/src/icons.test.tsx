import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Bell, Check } from './icons'

describe('icons', () => {
  it('renders lucide with size 18, strokeWidth 2 and aria-hidden by default', () => {
    const { container } = render(<Bell />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('width')).toBe('18')
    expect(svg?.getAttribute('height')).toBe('18')
    expect(svg?.getAttribute('stroke-width')).toBe('2')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })

  it('lets callers override defaults', () => {
    const { container } = render(<Check size={24} strokeWidth={1.5} aria-label="ok" aria-hidden={false} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('24')
    expect(svg?.getAttribute('stroke-width')).toBe('1.5')
    expect(svg?.getAttribute('aria-label')).toBe('ok')
    expect(svg?.getAttribute('aria-hidden')).toBe('false')
  })
})
