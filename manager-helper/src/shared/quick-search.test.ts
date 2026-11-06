import { describe, expect, it } from 'vitest'
import { buildQuickSearchTitle } from './quick-search'
import type { QuickSearchForm } from './quick-search'

const base: QuickSearchForm = {
  segment: 'education',
  level: 'any',
  base: '',
  directions: [],
  ege: 'unknown',
  stateSupport: false,
  topics: [],
  topicText: '',
  count: 5,
}

describe('buildQuickSearchTitle', () => {
  it('joins level and direction', () => {
    expect(buildQuickSearchTitle({ ...base, level: 'bachelor', directions: ['Медицина'] })).toBe(
      'Бакалавриат · Медицина',
    )
  })

  it('uses only directions for any level', () => {
    expect(buildQuickSearchTitle({ ...base, directions: ['Медицина', 'Психология'] })).toBe(
      'Медицина, Психология',
    )
  })

  it('uses only the level when no direction is chosen', () => {
    expect(buildQuickSearchTitle({ ...base, level: 'master' })).toBe('Магистратура')
  })

  it('falls back to a generic title for an empty education form', () => {
    expect(buildQuickSearchTitle(base)).toBe('Подбор программ')
  })

  it('builds course titles from topics and custom text', () => {
    expect(
      buildQuickSearchTitle({
        ...base,
        segment: 'courses',
        topics: ['Бухгалтерия'],
        topicText: ' SMM ',
      }),
    ).toBe('Курсы и ДПО · Бухгалтерия, SMM')
    expect(buildQuickSearchTitle({ ...base, segment: 'courses' })).toBe('Курсы и ДПО')
  })

  it('never exceeds 120 characters', () => {
    const long = 'я'.repeat(300)
    expect(
      buildQuickSearchTitle({ ...base, segment: 'courses', topicText: long }).length,
    ).toBeLessThanOrEqual(120)
  })
})
