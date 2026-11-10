import { describe, expect, it } from 'vitest'
import { SESSION_STATES, canTransition, assertTransition } from './session-state'

describe('session state transitions', () => {
  it.each([
    ['restoring', 'authenticated'],
    ['restoring', 'mustChangePassword'],
    ['restoring', 'unauthenticated'],
    ['restoring', 'connectionError'],
    ['connectionError', 'restoring'],
    ['unauthenticated', 'authenticated'],
    ['unauthenticated', 'mustChangePassword'],
    ['authenticated', 'unauthenticated'],
    ['authenticated', 'mustChangePassword'],
    ['mustChangePassword', 'authenticated'],
    ['mustChangePassword', 'unauthenticated']
  ] as const)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true)
    expect(() => assertTransition(from, to)).not.toThrow()
  })

  it.each([
    ['connectionError', 'authenticated'],
    ['connectionError', 'unauthenticated'],
    ['unauthenticated', 'connectionError'],
    ['authenticated', 'connectionError'],
    ['authenticated', 'restoring'],
    ['mustChangePassword', 'restoring'],
    ['authenticated', 'authenticated']
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false)
    expect(() => assertTransition(from, to)).toThrow()
  })

  it('declares exactly the five states from the architecture', () => {
    expect([...SESSION_STATES].sort()).toEqual(
      ['authenticated', 'connectionError', 'mustChangePassword', 'restoring', 'unauthenticated'].sort()
    )
  })
})
