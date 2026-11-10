import { create } from 'zustand'
import type { TaskView } from '@/features/tasks/view-filter'
import type { TaskStatus } from '@/lib/backend/tasks.schema'

export type TaskSort = 'deadline' | 'createdAt' | 'updatedAt'
export type TaskOrder = 'asc' | 'desc'

interface TasksData {
  view: TaskView
  status: TaskStatus | null
  search: string
  sort: TaskSort
  order: TaskOrder
  /** 1-based, as in the backend API. */
  page: number
  selectedTaskId: string | null
}

interface TasksActions {
  setView: (view: TaskView) => void
  setStatus: (status: TaskStatus | null) => void
  setSearch: (search: string) => void
  setSort: (sort: TaskSort) => void
  setOrder: (order: TaskOrder) => void
  setPage: (page: number) => void
  selectTask: (id: string | null) => void
  /** Back to "all" without status or search; sorting and selection stay. */
  resetFilters: () => void
}

export type TasksState = TasksData & TasksActions

export const INITIAL_TASKS_STATE: TasksData = {
  view: 'all',
  status: null,
  search: '',
  sort: 'createdAt',
  order: 'desc',
  page: 1,
  selectedTaskId: null
}

// Every filter or sort change returns to the first page.
export const useTasksStore = create<TasksState>((set) => ({
  ...INITIAL_TASKS_STATE,
  setView: (view) => set({ view, page: 1 }),
  setStatus: (status) => set({ status, page: 1 }),
  setSearch: (search) => set({ search, page: 1 }),
  setSort: (sort) => set({ sort, page: 1 }),
  setOrder: (order) => set({ order, page: 1 }),
  setPage: (page) => set({ page }),
  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  resetFilters: () => set({ view: 'all', status: null, search: '', page: 1 })
}))
