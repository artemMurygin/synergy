import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { LayoutModeProvider, layoutModeForWidth, useLayoutMode } from './layout-mode'

function setWidth(width: number) {
  act(() => {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
    window.dispatchEvent(new Event('resize'))
  })
}

let mounts = 0
function Probe() {
  const mode = useLayoutMode()
  useEffect(() => {
    mounts += 1
  }, [])
  return <span data-testid="mode">{mode}</span>
}

describe('layoutModeForWidth', () => {
  it('switches mobile to tablet at 640', () => {
    expect(layoutModeForWidth(639)).toBe('mobile')
    expect(layoutModeForWidth(640)).toBe('tablet')
  })
})

describe('LayoutModeProvider', () => {
  it('keeps a fixed desktop mode at any width', () => {
    setWidth(320)
    render(
      <LayoutModeProvider mode="desktop">
        <Probe />
      </LayoutModeProvider>,
    )
    expect(screen.getByTestId('mode').textContent).toBe('desktop')
    setWidth(900)
    expect(screen.getByTestId('mode').textContent).toBe('desktop')
  })

  it('follows the width on resize without remounting children', () => {
    mounts = 0
    setWidth(380)
    render(
      <LayoutModeProvider>
        <Probe />
      </LayoutModeProvider>,
    )
    expect(screen.getByTestId('mode').textContent).toBe('mobile')
    setWidth(860)
    expect(screen.getByTestId('mode').textContent).toBe('tablet')
    expect(mounts).toBe(1)
  })
})
