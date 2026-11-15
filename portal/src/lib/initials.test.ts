import { describe, expect, it } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it('takes the first letters of the surname and the name', () => {
    expect(initials('Котова Анна Сергеевна')).toBe('КА')
  })
  it('takes the first two letters of a one-word name (a login)', () => {
    expect(initials('petrov')).toBe('PE')
  })
  it('ignores extra spaces and gives an empty string for an empty name', () => {
    expect(initials('  Орлова   Светлана ')).toBe('ОС')
    expect(initials('')).toBe('')
  })
})
