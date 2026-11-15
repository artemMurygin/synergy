import { beforeEach, describe, expect, it } from 'vitest'
import type { Profile } from '@/lib/schemas'
import { useSessionStore } from './session.store'

const profile: Profile = { id: 'u1', login: 'ivan', mustChangePassword: false, roles: ['developer'], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null }

describe('session store', () => {
  beforeEach(() => {
    useSessionStore.setState(useSessionStore.getInitialState())
    localStorage.clear()
    sessionStorage.clear()
  })

  it('starts restoring without token and profile', () => {
    const s = useSessionStore.getState()
    expect(s.status).toBe('restoring')
    expect(s.accessToken).toBeNull()
    expect(s.profile).toBeNull()
  })

  it('signIn keeps the token and the profile with roles', () => {
    useSessionStore.getState().signIn('tok', profile)
    const s = useSessionStore.getState()
    expect(s.status).toBe('signedIn')
    expect(s.accessToken).toBe('tok')
    expect(s.profile?.roles).toEqual(['developer'])
  })

  it('setAccessToken replaces only the token', () => {
    useSessionStore.getState().signIn('tok', profile)
    useSessionStore.getState().setAccessToken('tok2')
    expect(useSessionStore.getState().accessToken).toBe('tok2')
    expect(useSessionStore.getState().profile).toEqual(profile)
  })

  it('signOut clears token and profile', () => {
    useSessionStore.getState().signIn('tok', profile)
    useSessionStore.getState().signOut()
    const s = useSessionStore.getState()
    expect(s).toMatchObject({ status: 'signedOut', accessToken: null, profile: null })
  })

  it('markUnavailable clears the token and sets the unavailable status', () => {
    useSessionStore.getState().signIn('tok', profile)
    useSessionStore.getState().markUnavailable()
    expect(useSessionStore.getState()).toMatchObject({ status: 'unavailable', accessToken: null })
  })

  it('never writes the token to localStorage or sessionStorage', () => {
    useSessionStore.getState().signIn('secret-token', profile)
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret-token')
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('secret-token')
    expect(localStorage.length + sessionStorage.length).toBe(0)
  })
})
