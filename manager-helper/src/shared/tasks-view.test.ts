import { describe, expect, it } from 'vitest'
import type { Task } from './tasks-api'
import {
  hasMore,
  mergeStreams,
  nextPage,
  openTasksFilters,
  remaining,
  viewFilters,
  type TaskStream,
} from './tasks-view'

function task(id: string, deadline: string | null, status: Task['status'] = 'todo'): Task {
  return {
    id,
    title: id,
    description: '',
    status,
    deadline,
    creator: { id: 'u1', login: 'anna' },
    assignee: { id: 'u1', login: 'anna' },
    watchers: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    completedAt: null,
  }
}

function stream(
  status: 'todo' | 'in_progress',
  items: Task[],
  total = items.length,
  page = 0,
): TaskStream {
  return {
    filter: { status, assigneeId: 'u1', sort: 'deadline', order: 'asc', limit: 50 },
    items,
    total,
    page,
  }
}

describe('openTasksFilters', () => {
  it('builds one request per open status for the assignee, sorted by deadline', () => {
    expect(openTasksFilters('u1', 50)).toEqual([
      { status: 'todo', assigneeId: 'u1', sort: 'deadline', order: 'asc', limit: 50, page: 0 },
      {
        status: 'in_progress',
        assigneeId: 'u1',
        sort: 'deadline',
        order: 'asc',
        limit: 50,
        page: 0,
      },
    ])
  })
})

describe('mergeStreams', () => {
  it('merges todo and in_progress by deadline, nearest first', () => {
    const merged = mergeStreams([
      stream('todo', [task('a', '2026-11-10T00:00:00Z'), task('c', '2026-11-30T00:00:00Z')]),
      stream('in_progress', [task('b', '2026-11-20T00:00:00Z', 'in_progress')]),
    ])
    expect(merged.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('puts tasks without a deadline last, keeping stream order among them', () => {
    const merged = mergeStreams([
      stream('todo', [task('a', '2026-11-10T00:00:00Z'), task('n1', null)]),
      stream('in_progress', [task('b', '2026-12-01T00:00:00Z', 'in_progress'), task('n2', null)]),
    ])
    expect(merged.map((t) => t.id)).toEqual(['a', 'b', 'n1', 'n2'])
  })

  it('compares deadlines as instants, not strings', () => {
    const merged = mergeStreams([
      stream('todo', [task('late', '2026-11-10T12:00:00+05:00')]),
      stream('in_progress', [task('early', '2026-11-10T09:00:00Z', 'in_progress')]),
    ])
    expect(merged.map((t) => t.id)).toEqual(['late', 'early'])
  })

  it('returns an empty list for empty streams', () => {
    expect(mergeStreams([stream('todo', []), stream('in_progress', [])])).toEqual([])
  })
})

describe('pagination remainder per stream', () => {
  it('counts what is left in each stream independently', () => {
    const todo = stream('todo', [task('a', null)], 3)
    const progress = stream('in_progress', [task('b', null, 'in_progress')], 1)
    expect(remaining(todo)).toBe(2)
    expect(hasMore(todo)).toBe(true)
    expect(remaining(progress)).toBe(0)
    expect(hasMore(progress)).toBe(false)
  })

  it('never reports a negative remainder', () => {
    expect(remaining(stream('todo', [task('a', null), task('b', null)], 1))).toBe(0)
  })

  it('asks for the next page of a stream', () => {
    expect(nextPage(stream('todo', [], 120, 1))).toEqual({
      status: 'todo',
      assigneeId: 'u1',
      sort: 'deadline',
      order: 'asc',
      limit: 50,
      page: 2,
    })
  })
})

describe('viewFilters', () => {
  it('"mine" is the two open streams of the assignee', () => {
    expect(viewFilters('mine', 'u1', '', 50)).toEqual(openTasksFilters('u1', 50))
  })

  it('"watching" filters by watcher in a single stream, freshest first', () => {
    expect(viewFilters('watching', 'u1', '', 50)).toEqual([
      { watcherId: 'u1', sort: 'updatedAt', order: 'desc', limit: 50, page: 0 },
    ])
  })

  it('"created" filters by creator in a single stream', () => {
    expect(viewFilters('created', 'u1', '', 50)).toEqual([
      { creatorId: 'u1', sort: 'updatedAt', order: 'desc', limit: 50, page: 0 },
    ])
  })

  it('"done" shows my closed tasks', () => {
    expect(viewFilters('done', 'u1', '', 50)).toEqual([
      { status: 'done', assigneeId: 'u1', sort: 'updatedAt', order: 'desc', limit: 50, page: 0 },
    ])
  })

  it('adds a trimmed search to every stream and skips a blank one', () => {
    for (const filter of viewFilters('mine', 'u1', '  отчёт ', 50)) {
      expect(filter.search).toBe('отчёт')
    }
    expect(viewFilters('created', 'u1', '   ', 50)[0]).not.toHaveProperty('search')
  })
})

describe('mergeStreams of a single stream', () => {
  it('keeps the server order', () => {
    const single = stream('todo', [
      task('b', '2026-12-01T00:00:00Z'),
      task('a', '2026-11-01T00:00:00Z'),
    ])
    expect(mergeStreams([single]).map((t) => t.id)).toEqual(['b', 'a'])
  })
})
