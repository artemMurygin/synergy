import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UnreadBadge } from './UnreadBadge'

afterEach(cleanup)

describe('UnreadBadge', () => {
  it('renders nothing for zero', () => {
    const { container } = render(<UnreadBadge count={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the count', () => {
    render(<UnreadBadge count={5} />)
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('shows 99 as is', () => {
    render(<UnreadBadge count={99} />)
    expect(screen.getByText('99')).toBeTruthy()
  })

  it('caps at 99+ from 100', () => {
    render(<UnreadBadge count={100} />)
    expect(screen.getByText('99+')).toBeTruthy()
    cleanup()
    render(<UnreadBadge count={150} />)
    expect(screen.getByText('99+')).toBeTruthy()
  })
})
