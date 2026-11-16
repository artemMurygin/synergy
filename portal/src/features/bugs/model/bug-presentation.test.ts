import { describe, expect, it } from 'vitest'
import { BUG_QUEUE_FILTERS, BUG_STATUS_LABELS, BUG_STATUS_PRESENTATION } from './bug-presentation'
import { BUG_STATUSES } from './bugs.schema'

describe('bug-presentation', () => {
  it('labels every status in Russian', () => {
    expect(BUG_STATUS_LABELS).toEqual({ open: 'Открыт', in_progress: 'В работе', resolved: 'Исправлен', wont_fix: 'Не будет исправлен' })
  })

  it('maps statuses to badge tones', () => {
    expect(BUG_STATUS_PRESENTATION.open.tone).toBe('warning')
    expect(BUG_STATUS_PRESENTATION.in_progress.tone).toBe('info')
    expect(BUG_STATUS_PRESENTATION.resolved.tone).toBe('success')
    expect(BUG_STATUS_PRESENTATION.wont_fix.tone).toBe('neutral')
  })

  it('gives "Открыт" an ink-80 text and no other status overrides', () => {
    expect(BUG_STATUS_PRESENTATION.open.className).toBe('text-ink-80')
    for (const s of BUG_STATUSES.filter((x) => x !== 'open')) expect(BUG_STATUS_PRESENTATION[s].className).toBeUndefined()
  })

  it('queue filter starts with "Незакрытые" followed by the four statuses', () => {
    expect(BUG_QUEUE_FILTERS.map((f) => f.label)).toEqual(['Незакрытые', 'Открыт', 'В работе', 'Исправлен', 'Не будет исправлен'])
    expect(BUG_QUEUE_FILTERS[0]?.id).toBe('unclosed')
  })
})
