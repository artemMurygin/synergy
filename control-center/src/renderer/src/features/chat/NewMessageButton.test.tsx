import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewMessageButton } from './NewMessageButton'

afterEach(cleanup)

describe('NewMessageButton', () => {
  it('is hidden while no new message arrived', () => {
    render(<NewMessageButton messageCount={3} isAtBottom={false} onScrollToBottom={() => {}} />)
    expect(screen.queryByRole('button', { name: /Новое сообщение/ })).toBeNull()
  })

  it('appears when a message arrives while the feed is scrolled up', () => {
    const { rerender } = render(<NewMessageButton messageCount={3} isAtBottom={false} onScrollToBottom={() => {}} />)
    rerender(<NewMessageButton messageCount={4} isAtBottom={false} onScrollToBottom={() => {}} />)
    expect(screen.getByRole('button', { name: /Новое сообщение/ })).toBeTruthy()
  })

  it('stays hidden when a message arrives at the bottom of the feed', () => {
    const { rerender } = render(<NewMessageButton messageCount={3} isAtBottom onScrollToBottom={() => {}} />)
    rerender(<NewMessageButton messageCount={4} isAtBottom onScrollToBottom={() => {}} />)
    expect(screen.queryByRole('button', { name: /Новое сообщение/ })).toBeNull()
  })

  it('scrolls to the bottom on click and hides', async () => {
    const onScrollToBottom = vi.fn()
    const { rerender } = render(
      <NewMessageButton messageCount={3} isAtBottom={false} onScrollToBottom={onScrollToBottom} />
    )
    rerender(<NewMessageButton messageCount={4} isAtBottom={false} onScrollToBottom={onScrollToBottom} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Новое сообщение/ }))
    expect(onScrollToBottom).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Новое сообщение/ })).toBeNull()
  })

  it('hides when the user scrolls down to the new message', () => {
    const { rerender } = render(<NewMessageButton messageCount={3} isAtBottom={false} onScrollToBottom={() => {}} />)
    rerender(<NewMessageButton messageCount={4} isAtBottom={false} onScrollToBottom={() => {}} />)
    rerender(<NewMessageButton messageCount={4} isAtBottom onScrollToBottom={() => {}} />)
    expect(screen.queryByRole('button', { name: /Новое сообщение/ })).toBeNull()
  })
})
