import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from './ui.store'

beforeEach(() => {
  useUiStore.setState({ section: 'chats', dark: false })
})

describe('ui store section', () => {
  it('starts on the chats section', () => {
    expect(useUiStore.getInitialState().section).toBe('chats')
  })

  it('switches the active section', () => {
    useUiStore.getState().setSection('tasks')
    expect(useUiStore.getState().section).toBe('tasks')
    useUiStore.getState().setSection('chats')
    expect(useUiStore.getState().section).toBe('chats')
  })
})
