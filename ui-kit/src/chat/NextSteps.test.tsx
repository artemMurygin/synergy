import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CARD_STEPS, OVERVIEW_STEPS } from './next-steps'
import { NextSteps } from './NextSteps'

describe('NextSteps', () => {
  it('shows three hints under an overview answer', () => {
    render(<NextSteps lastAnswer={'1. a\n2. b'} disabled={false} onSend={() => undefined} />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('shows three hints under a card', () => {
    render(<NextSteps lastAnswer="### Карточка" disabled={false} onSend={() => undefined} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(CARD_STEPS.map((s) => s.label))
  })

  it('shows nothing under other answers', () => {
    const { container } = render(<NextSteps lastAnswer="Привет" disabled={false} onSend={() => undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('is hidden while the agent answers or after an error (disabled)', () => {
    const { container } = render(<NextSteps lastAnswer={'1. a\n2. b'} disabled onSend={() => undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('sends the question of the hint on click', async () => {
    const onSend = vi.fn()
    render(<NextSteps lastAnswer={'1. a\n2. b'} disabled={false} onSend={onSend} />)
    const step = OVERVIEW_STEPS[1]
    await userEvent.setup().click(screen.getByRole('button', { name: step?.label ?? '' }))
    expect(onSend).toHaveBeenCalledWith(step?.query)
  })
})
