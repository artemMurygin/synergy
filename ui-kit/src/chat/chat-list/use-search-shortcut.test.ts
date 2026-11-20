import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMacPlatform, useSearchShortcut } from './use-search-shortcut'

function press(init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  act(() => {
    document.dispatchEvent(event)
  })
  return event
}

function setup(options: { mac: boolean; collapsed?: boolean }) {
  const onShow = vi.fn()
  const onClear = vi.fn()
  const hook = renderHook(
    ({ collapsed }) => useSearchShortcut({ collapsed, onShow, onClear, isMac: options.mac }),
    { initialProps: { collapsed: options.collapsed ?? false } },
  )
  const input = document.createElement('input')
  document.body.append(input)
  hook.result.current.inputRef.current = input
  return { ...hook, input, onShow, onClear }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useSearchShortcut', () => {
  it('focuses the search on Cmd+K on macOS and takes the key from the browser', () => {
    const { input } = setup({ mac: true })
    const event = press({ key: 'k', metaKey: true })
    expect(document.activeElement).toBe(input)
    expect(event.defaultPrevented).toBe(true)
  })

  it('focuses the search on Ctrl+K on other systems and ignores Cmd+K there', () => {
    const { input } = setup({ mac: false })
    press({ key: 'k', metaKey: true })
    expect(document.activeElement).not.toBe(input)
    press({ key: 'k', ctrlKey: true })
    expect(document.activeElement).toBe(input)
  })

  it('does not react to Ctrl+K on macOS or to a plain K', () => {
    const { input } = setup({ mac: true })
    press({ key: 'k', ctrlKey: true })
    press({ key: 'k' })
    expect(document.activeElement).not.toBe(input)
  })

  it('shows the hidden list first and focuses once the search is mounted', () => {
    const { input, onShow, rerender, result } = setup({ mac: true, collapsed: true })
    press({ key: 'K', metaKey: true })
    expect(onShow).toHaveBeenCalledTimes(1)
    expect(document.activeElement).not.toBe(input)
    result.current.inputRef.current = input
    rerender({ collapsed: false })
    expect(document.activeElement).toBe(input)
  })

  it('on Escape in the search clears it and returns focus to the composer', () => {
    const { result, onClear, input } = setup({ mac: true })
    const composer = document.createElement('textarea')
    composer.setAttribute('data-chat-composer-input', '')
    document.body.append(composer)
    input.focus()
    const event = { key: 'Escape', preventDefault: vi.fn() }
    act(() => {
      result.current.onInputKeyDown(event)
    })
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(composer)
  })

  it('leaves other keys in the search alone', () => {
    const { result, onClear } = setup({ mac: true })
    result.current.onInputKeyDown({ key: 'a', preventDefault: vi.fn() })
    expect(onClear).not.toHaveBeenCalled()
  })

  it('names the hint after the platform', () => {
    expect(setup({ mac: true }).result.current.hint).toBe('Поиск (⌘K)')
    expect(setup({ mac: false }).result.current.hint).toBe('Поиск (Ctrl+K)')
  })
})

describe('isMacPlatform', () => {
  it('recognises macOS by the platform string', () => {
    expect(isMacPlatform('MacIntel')).toBe(true)
    expect(isMacPlatform('Win32')).toBe(false)
  })
})
