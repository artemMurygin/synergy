import { describe, expect, it } from 'vitest'
import { DEFAULT_TASKS_QUERY, hasMore, nextPage, remaining, taskListFilter } from './tasks-view'
import type { TaskStream } from './tasks-view'

describe('DEFAULT_TASKS_QUERY', () => {
  it('opens "Мои" sorted by the deadline without status filter', () => {
    expect(DEFAULT_TASKS_QUERY).toEqual({ view: 'mine', status: 'all', sort: 'deadline', search: '' })
  })
})

describe('taskListFilter', () => {
  const base = DEFAULT_TASKS_QUERY

  it('"mine" is the tasks assigned to the user, the nearest deadline first', () => {
    expect(taskListFilter(base, 'u1')).toEqual({
      assigneeId: 'u1',
      sort: 'deadline',
      order: 'asc',
      limit: 50,
    })
  })

  it('maps the other views', () => {
    expect(taskListFilter({ ...base, view: 'all' }, 'u1')).not.toHaveProperty('assigneeId')
    expect(taskListFilter({ ...base, view: 'watching' }, 'u1')).toMatchObject({ watcherId: 'u1' })
    expect(taskListFilter({ ...base, view: 'created' }, 'u1')).toMatchObject({ creatorId: 'u1' })
    expect(taskListFilter({ ...base, view: 'overdue' }, 'u1')).toMatchObject({ overdue: true })
  })

  it('replaces the old "Готовые" view with the status filter', () => {
    expect(taskListFilter({ ...base, status: 'done' }, 'u1')).toMatchObject({
      status: 'done',
      assigneeId: 'u1',
    })
  })

  it('maps the sorts and trims the search, dropping a blank one', () => {
    expect(taskListFilter({ ...base, sort: 'updated' }, 'u1')).toMatchObject({
      sort: 'updatedAt',
      order: 'desc',
    })
    expect(taskListFilter({ ...base, sort: 'created' }, 'u1')).toMatchObject({
      sort: 'createdAt',
      order: 'desc',
    })
    expect(taskListFilter({ ...base, search: ' КП ' }, 'u1')).toMatchObject({ search: 'КП' })
    expect(taskListFilter({ ...base, search: '  ' }, 'u1')).not.toHaveProperty('search')
  })
})

describe('paging', () => {
  const stream: TaskStream = { filter: { assigneeId: 'u1' }, items: [], total: 3, page: 0 }
  it('counts the rest and builds the next page request', () => {
    expect(remaining(stream)).toBe(3)
    expect(hasMore(stream)).toBe(true)
    expect(hasMore({ ...stream, total: 0 })).toBe(false)
    expect(nextPage(stream)).toEqual({ assigneeId: 'u1', page: 1 })
  })
})
