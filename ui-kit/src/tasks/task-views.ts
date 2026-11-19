import type { LayoutMode } from '../layout/layout-mode'

export type TaskView = 'all' | 'mine' | 'watching' | 'created' | 'overdue'

export const TASK_VIEW_LABEL: Record<TaskView, string> = {
  all: 'Все',
  mine: 'Мои',
  watching: 'Я наблюдаю',
  created: 'Созданные мной',
  overdue: 'Просрочено',
}

export const TASK_VIEW_DEFAULT: TaskView = 'mine'

const ALL_VIEWS: TaskView[] = ['all', 'mine', 'watching', 'created', 'overdue']

/** Видимые сегменты и состав меню «Ещё» по режиму раскладки. */
export function taskViewLayout(mode: LayoutMode): { segments: TaskView[]; menu: TaskView[] } {
  if (mode === 'desktop') return { segments: ALL_VIEWS, menu: [] }
  if (mode === 'tablet') return { segments: ['all', 'mine'], menu: ['watching', 'created', 'overdue'] }
  return { segments: ['all', 'mine', 'overdue'], menu: ['watching', 'created'] }
}

/** Какой сегмент показан выбранным: «more», если представление лежит в меню «Ещё». */
export function selectedSegment(mode: LayoutMode, view: TaskView): TaskView | 'more' {
  return taskViewLayout(mode).segments.includes(view) ? view : 'more'
}
