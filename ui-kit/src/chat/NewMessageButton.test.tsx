import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NewMessageButton } from './NewMessageButton'

describe('NewMessageButton', () => {
  it('is hidden at first', () => {
    render(<NewMessageButton messageCount={1} isAtBottom={false} onScrollToBottom={() => undefined} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('appears when a message arrives while the feed is scrolled up, and scrolls down on click', async () => {
    const onScroll = vi.fn()
    const { rerender } = render(<NewMessageButton messageCount={1} isAtBottom={false} onScrollToBottom={onScroll} />)
    rerender(<NewMessageButton messageCount={2} isAtBottom={false} onScrollToBottom={onScroll} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Новое сообщение/ }))
    expect(onScroll).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('does not appear when the feed is at the bottom', () => {
    const { rerender } = render(<NewMessageButton messageCount={1} isAtBottom onScrollToBottom={() => undefined} />)
    rerender(<NewMessageButton messageCount={2} isAtBottom onScrollToBottom={() => undefined} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
