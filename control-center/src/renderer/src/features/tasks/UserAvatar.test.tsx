import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { initialsOf, UserAvatar } from './UserAvatar'

afterEach(cleanup)

const avatar = (container: HTMLElement): HTMLElement => container.querySelector('[data-slot="user-avatar"]') as HTMLElement

describe('initialsOf', () => {
  it('takes the first two letters of the login in upper case', () => {
    expect(initialsOf('maria')).toBe('MA')
    expect(initialsOf('иван')).toBe('ИВ')
    expect(initialsOf('a')).toBe('A')
  })

  it('returns a dash without a login', () => {
    expect(initialsOf(null)).toBe('—')
    expect(initialsOf('  ')).toBe('—')
  })
})

describe('UserAvatar', () => {
  it('renders the initials in a round, decorative badge', () => {
    const { container } = render(<UserAvatar login="anna" />)
    const el = avatar(container)
    expect(el.textContent).toBe('AN')
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.className).toContain('rounded-full')
    expect(el.className).toContain('size-7')
  })

  it('renders a neutral dash for an unassigned user', () => {
    const { container } = render(<UserAvatar login={null} />)
    expect(avatar(container).textContent).toBe('—')
  })

  it('supports the small size', () => {
    const { container } = render(<UserAvatar login="ivan" size="sm" />)
    expect(avatar(container).className).toContain('size-6')
  })
})
