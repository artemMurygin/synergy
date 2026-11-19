import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders each variant as a button with its label', () => {
    render(
      <>
        <Button variant="primary">A</Button>
        <Button variant="secondary">B</Button>
        <Button variant="ghost">C</Button>
        <Button variant="icon-round" aria-label="D">
          x
        </Button>
      </>,
    )
    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'D' })).toBeTruthy()
  })

  it('does not fire click when disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Go' }).hasAttribute('disabled')).toBe(true)
  })

  it('fires click when enabled', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('requires aria-label for icon-round at type level', () => {
    // @ts-expect-error aria-label is required for the icon-round variant
    const bad = <Button variant="icon-round">x</Button>
    expect(bad).toBeTruthy()
  })
})
