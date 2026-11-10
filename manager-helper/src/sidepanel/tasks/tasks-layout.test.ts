import { describe, expect, it } from 'vitest'
import { tasksPaneVisibility } from './tasks-layout'

describe('tasksPaneVisibility', () => {
  it('shows one column at 639 px: the list without a selection', () => {
    expect(tasksPaneVisibility(639, null)).toEqual({
      list: true,
      details: false,
      backToList: false,
    })
  })

  it('shows the details screen of the selected task at 639 px', () => {
    expect(tasksPaneVisibility(639, 't1')).toEqual({ list: false, details: true, backToList: true })
  })

  it('shows two columns at 640 px with or without a selection, without a back button', () => {
    expect(tasksPaneVisibility(640, null)).toEqual({ list: true, details: true, backToList: false })
    expect(tasksPaneVisibility(640, 't1')).toEqual({ list: true, details: true, backToList: false })
  })
})
