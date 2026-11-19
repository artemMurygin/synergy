import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthBrand } from './AuthBrand'

describe('AuthBrand', () => {
  it('renders the Synergy logo as an accessible image', () => {
    render(<AuthBrand />)
    const logo = screen.getByRole('img', { name: 'Синергия' })
    expect(logo.tagName.toLowerCase()).toBe('svg')
    expect(logo.querySelectorAll('path').length).toBeGreaterThan(1)
  })
})
