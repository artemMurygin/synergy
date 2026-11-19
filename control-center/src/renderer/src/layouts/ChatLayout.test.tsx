import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChatLayout } from './ChatLayout'

afterEach(cleanup)

describe('ChatLayout', () => {
  it('shows the list beside the chat', () => {
    render(<ChatLayout sidebar={<p>list</p>} main={<p>thread</p>} />)
    expect(screen.getByRole('complementary', { name: 'Список чатов' }).textContent).toBe('list')
    expect(screen.getByRole('main').textContent).toBe('thread')
  })

  it('drops the list while it is hidden and leaves the whole width to the chat', () => {
    render(<ChatLayout collapsed sidebar={<p>list</p>} main={<p>thread</p>} />)
    expect(screen.queryByText('list')).toBeNull()
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.getByRole('main').className).toContain('flex-1')
  })
})
