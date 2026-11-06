import { describe, expect, it } from 'vitest'
import { isFormOpen } from './form-visibility'

describe('isFormOpen', () => {
  it('is open in a chat without agent answers', () => {
    expect(isFormOpen(0, -1)).toBe(true)
  })

  it('is collapsed in a chat with answers', () => {
    expect(isFormOpen(2, -1)).toBe(false)
  })

  it('is open after the user asks for a new search at the current answer count', () => {
    expect(isFormOpen(2, 2)).toBe(true)
  })

  it('collapses again once a new answer arrives', () => {
    expect(isFormOpen(3, 2)).toBe(false)
  })
})
