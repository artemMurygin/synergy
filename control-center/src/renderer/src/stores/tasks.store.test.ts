import { beforeEach, describe, expect, it } from 'vitest'
import { INITIAL_TASKS_STATE, useTasksStore } from './tasks.store'

beforeEach(() => {
  useTasksStore.setState(INITIAL_TASKS_STATE)
})

describe('useTasksStore', () => {
  it('starts with the "all" view, newest first, first page and nothing selected', () => {
    expect(useTasksStore.getState()).toMatchObject({
      view: 'all',
      status: null,
      search: '',
      sort: 'createdAt',
      order: 'desc',
      page: 1,
      selectedTaskId: null
    })
  })

  it.each([
    ['setView', 'mine'],
    ['setStatus', 'done'],
    ['setSearch', 'отчёт'],
    ['setSort', 'deadline'],
    ['setOrder', 'asc']
  ] as const)('%s resets the page to 1', (setter, value) => {
    useTasksStore.setState({ page: 4 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(useTasksStore.getState()[setter] as (v: any) => void)(value)
    expect(useTasksStore.getState().page).toBe(1)
  })

  it('stores the new filter value', () => {
    const s = useTasksStore.getState()
    s.setView('overdue')
    s.setStatus('in_progress')
    s.setSearch('abc')
    s.setSort('updatedAt')
    s.setOrder('asc')
    expect(useTasksStore.getState()).toMatchObject({
      view: 'overdue',
      status: 'in_progress',
      search: 'abc',
      sort: 'updatedAt',
      order: 'asc'
    })
  })

  it('setPage changes only the page', () => {
    useTasksStore.getState().setView('mine')
    useTasksStore.getState().setPage(3)
    expect(useTasksStore.getState()).toMatchObject({ page: 3, view: 'mine' })
  })

  it('selects and clears the selected task', () => {
    useTasksStore.getState().selectTask('t1')
    expect(useTasksStore.getState().selectedTaskId).toBe('t1')
    useTasksStore.getState().selectTask(null)
    expect(useTasksStore.getState().selectedTaskId).toBeNull()
  })

  it('changing a filter keeps the selected task', () => {
    useTasksStore.getState().selectTask('t1')
    useTasksStore.getState().setView('mine')
    expect(useTasksStore.getState().selectedTaskId).toBe('t1')
  })

  it('resetFilters restores view, status, search and page but keeps sort and selection', () => {
    const s = useTasksStore.getState()
    s.setView('mine')
    s.setStatus('done')
    s.setSearch('x')
    s.setSort('deadline')
    s.setPage(5)
    s.selectTask('t9')
    useTasksStore.getState().resetFilters()
    expect(useTasksStore.getState()).toMatchObject({
      view: 'all',
      status: null,
      search: '',
      page: 1,
      sort: 'deadline',
      selectedTaskId: 't9'
    })
  })
})
