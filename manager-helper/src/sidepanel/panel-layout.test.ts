import { describe, expect, it } from 'vitest'
import { isWidePanel, paneVisibility, WIDE_BREAKPOINT } from './panel-layout'

describe('panel layout', () => {
  it('treats 640 px and above as wide', () => {
    expect(WIDE_BREAKPOINT).toBe(640)
    expect(isWidePanel(639)).toBe(false)
    expect(isWidePanel(640)).toBe(true)
    expect(isWidePanel(860)).toBe(true)
  })

  it('shows one pane at a time on a narrow panel', () => {
    expect(paneVisibility(380, 'chat')).toEqual({ list: false, chat: true, backToList: true })
    expect(paneVisibility(380, 'list')).toEqual({ list: true, chat: false, backToList: false })
  })

  it('shows both panes without a list button on a wide panel, in any mode', () => {
    expect(paneVisibility(860, 'chat')).toEqual({ list: true, chat: true, backToList: false })
    expect(paneVisibility(860, 'list')).toEqual({ list: true, chat: true, backToList: false })
  })

  it('keeps the chosen mode when the width crosses the threshold', () => {
    const mode = 'chat' as const
    expect(paneVisibility(860, mode).chat).toBe(true)
    expect(paneVisibility(380, mode).chat).toBe(true)
  })
})
