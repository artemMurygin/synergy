import { describe, expect, it } from 'vitest'
import { formatDay, formatDeadline, formatFullDateTime, formatRelativeDateTime, groupByDeadline, isOverdue, quickDeadline } from './deadline'
import { makeTask } from './fixtures'
import { formatSize } from './format-size'

const NOW = new Date('2026-11-19T12:00:00')

describe('deadline', () => {
  it('isOverdue: открытая задача с дедлайном в прошлом', () => {
    expect(isOverdue('todo', '2026-11-01T10:00:00', NOW)).toBe(true)
    expect(isOverdue('in_progress', '2026-12-01T10:00:00', NOW)).toBe(false)
  })

  it('isOverdue: готовая или без срока не просрочена', () => {
    expect(isOverdue('done', '2026-11-01T10:00:00', NOW)).toBe(false)
    expect(isOverdue('todo', null, NOW)).toBe(false)
  })

  it('форматирует дату и время без точек', () => {
    expect(formatDeadline('2026-12-12T18:00:00')).toBe('12 дек, 18:00')
    expect(formatDay('2026-11-05T09:00:00')).toBe('5 ноя')
  })

  it('полная дата и относительная дата', () => {
    expect(formatFullDateTime('2026-12-12T18:00:00')).toBe('12 декабря 2026, 18:00')
    expect(formatRelativeDateTime('2026-11-19T09:05:00', NOW)).toBe('сегодня, 09:05')
    expect(formatRelativeDateTime('2026-11-18T09:05:00', NOW)).toBe('вчера, 09:05')
    expect(formatRelativeDateTime('2026-11-10T09:05:00', NOW)).toBe('10 ноября, 09:05')
  })

  it('formatSize', () => {
    expect(formatSize(500)).toBe('500 Б')
    expect(formatSize(2048)).toBe('2 КБ')
    expect(formatSize(1_468_006)).toBe('1,4 МБ')
  })
})

describe('quickDeadline', () => {
  it('без текущего времени ставит 18:00', () => {
    const d = quickDeadline('tomorrow', NOW, null)
    expect(formatDeadline(d.toISOString())).toBe('20 ноя, 18:00')
  })

  it('сохраняет выбранное время', () => {
    const current = new Date('2026-12-01T09:30:00')
    expect(formatDeadline(quickDeadline('today', NOW, current).toISOString())).toBe('19 ноя, 09:30')
    expect(formatDeadline(quickDeadline('week', NOW, current).toISOString())).toBe('26 ноя, 09:30')
  })
})

describe('groupByDeadline', () => {
  const at = (id: string, deadline: string | null, status: 'todo' | 'done' = 'todo') =>
    makeTask({ id, deadline, status })

  it('делит на группы в порядке показа и прячет пустые', () => {
    const groups = groupByDeadline(
      [
        at('none', null),
        at('later', '2027-01-20T10:00:00'),
        at('week', '2026-11-22T10:00:00'),
        at('over', '2026-11-01T10:00:00'),
      ],
      NOW,
    )
    expect(groups.map((g) => [g.key, g.label, g.items.map((t) => t.id)])).toEqual([
      ['overdue', 'Просрочено', ['over']],
      ['week', 'На этой неделе', ['week']],
      ['later', 'Позже', ['later']],
      ['none', 'Без срока', ['none']],
    ])
    expect(groupByDeadline([at('a', null)], NOW).map((g) => g.key)).toEqual(['none'])
  })

  it('готовая задача с прошедшим сроком не просрочена', () => {
    const groups = groupByDeadline([at('d', '2026-11-01T10:00:00', 'done')], NOW)
    expect(groups.map((g) => g.key)).not.toContain('overdue')
  })
})
