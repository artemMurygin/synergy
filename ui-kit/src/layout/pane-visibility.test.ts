import { describe, expect, it } from 'vitest'
import { chatPaneVisibility, tasksPaneVisibility } from './pane-visibility'

describe('chatPaneVisibility', () => {
  it('shows one pane at a time on mobile', () => {
    expect(chatPaneVisibility('mobile', 'chat')).toEqual({ list: false, chat: true, backToList: true })
    expect(chatPaneVisibility('mobile', 'list')).toEqual({ list: true, chat: false, backToList: false })
  })

  it('shows both panes without a list button on tablet and desktop, in any mode', () => {
    for (const layout of ['tablet', 'desktop'] as const) {
      expect(chatPaneVisibility(layout, 'chat')).toEqual({ list: true, chat: true, backToList: false })
      expect(chatPaneVisibility(layout, 'list')).toEqual({ list: true, chat: true, backToList: false })
    }
  })
})

describe('tasksPaneVisibility', () => {
  it('lets the selection decide the screen on mobile', () => {
    expect(tasksPaneVisibility('mobile', null)).toEqual({ list: true, details: false, backToList: false })
    expect(tasksPaneVisibility('mobile', 't1')).toEqual({ list: false, details: true, backToList: true })
  })

  it('shows list and details side by side otherwise', () => {
    for (const layout of ['tablet', 'desktop'] as const) {
      expect(tasksPaneVisibility(layout, null)).toEqual({ list: true, details: true, backToList: false })
      expect(tasksPaneVisibility(layout, 't1')).toEqual({ list: true, details: true, backToList: false })
    }
  })
})
