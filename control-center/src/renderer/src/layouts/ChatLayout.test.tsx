import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChatLayout } from './ChatLayout'

afterEach(cleanup)

describe('ChatLayout', () => {
  it('renders the sidebar footer slot inside the sidebar', () => {
    render(<ChatLayout sidebar={<p>list</p>} main={<p>thread</p>} sidebarFooter={<p>footer</p>} />)
    expect(screen.getByText('footer').closest('aside')).toBe(screen.getByText('list').closest('aside'))
  })

  it('renders without a footer', () => {
    render(<ChatLayout sidebar={<p>list</p>} main={<p>thread</p>} />)
    expect(screen.getByText('thread')).toBeTruthy()
  })
})
