import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutModeProvider, type LayoutMode } from '../layout/layout-mode'
import { makeTask, NOW } from './fixtures'
import { TaskList, type TaskListProps } from './TaskList'

function setup(over: Partial<TaskListProps> = {}, mode: LayoutMode = 'desktop') {
  const props: TaskListProps = {
    items: [makeTask(), makeTask({ id: 't2', title: 'Вторая' })],
    loading: false,
    error: null,
    hasMore: false,
    remaining: 0,
    selectedId: null,
    now: NOW,
    onOpen: vi.fn(),
    onLoadMore: vi.fn(),
    onRetry: vi.fn(),
    onCreate: vi.fn(),
    ...over,
  }
  render(
    <LayoutModeProvider mode={mode}>
      <TaskList {...props} />
    </LayoutModeProvider>,
  )
  return props
}

describe('TaskList', () => {
  it('первичная загрузка — скелетон', () => {
    setup({ items: [], loading: true })
    expect(screen.getByRole('status', { name: 'Загрузка задач' })).toBeTruthy()
  })

  it('обновление при наличии данных не прячет список', () => {
    setup({ refreshing: true })
    expect(screen.queryByRole('status', { name: 'Загрузка задач' })).toBeNull()
    expect(screen.getByText('Вторая')).toBeTruthy()
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBe('true')
  })

  it('пусто с действием «Создать задачу»', async () => {
    const props = setup({ items: [], view: 'mine' })
    await userEvent.click(screen.getByRole('button', { name: 'Создать задачу' }))
    expect(props.onCreate).toHaveBeenCalled()
  })

  it('ничего не найдено при поиске: сброс фильтров', async () => {
    const onResetFilters = vi.fn()
    setup({ items: [], searching: true, onResetFilters })
    expect(screen.getByText('Ничего не найдено')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Создать задачу' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    expect(onResetFilters).toHaveBeenCalled()
  })

  it('пустой список — иконка list-checks', () => {
    setup({ items: [], view: 'mine' })
    expect(document.querySelector('.lucide-list-checks')).toBeTruthy()
  })

  it('ошибка: wifi-off, заголовок, текст и «Повторить»', async () => {
    const props = setup({ items: [], error: 'Нет сети' })
    expect(screen.getByRole('alert').textContent).toContain('Не удалось загрузить задачи')
    expect(screen.getByText('Нет связи с сервером. Проверьте подключение и повторите.')).toBeTruthy()
    expect(document.querySelector('.lucide-wifi-off')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(props.onRetry).toHaveBeenCalled()
  })

  it('«Показать ещё» без счётчика, с иконкой chevrons-down', async () => {
    const props = setup({ hasMore: true, remaining: 7 })
    const button = screen.getByRole('button', { name: 'Показать ещё' })
    expect(button.textContent).toBe('Показать ещё')
    expect(button.querySelector('.lucide-chevrons-down')).toBeTruthy()
    await userEvent.click(button)
    expect(props.onLoadMore).toHaveBeenCalled()
  })
})

describe('TaskList: группы по сроку', () => {
  const items = [
    makeTask({ id: 'a', title: 'Просроченная', deadline: '2026-11-01T10:00:00' }),
    makeTask({ id: 'b', title: 'Скоро', deadline: '2026-11-22T10:00:00' }),
    makeTask({ id: 'c', title: 'Без даты', deadline: null }),
  ]

  it('tablet + сортировка по дедлайну: заголовки групп', () => {
    setup({ items, sort: 'deadline' }, 'tablet')
    expect(screen.getByRole('heading', { name: 'Просрочено' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'На этой неделе' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Без срока' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Позже' })).toBeNull()
  })

  it('mobile + сортировка по дедлайну: группы есть', () => {
    setup({ items, sort: 'deadline' }, 'mobile')
    expect(screen.getByRole('heading', { name: 'Без срока' })).toBeTruthy()
  })

  it('desktop: групп нет', () => {
    setup({ items, sort: 'deadline' }, 'desktop')
    expect(screen.queryByRole('heading', { name: 'На этой неделе' })).toBeNull()
  })

  it('другая сортировка: групп нет', () => {
    setup({ items, sort: 'updated' }, 'tablet')
    expect(screen.queryByRole('heading', { name: 'На этой неделе' })).toBeNull()
  })
})
