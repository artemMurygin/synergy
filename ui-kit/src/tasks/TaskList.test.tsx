import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeTask, NOW } from './fixtures'
import { TaskList, type TaskListProps } from './TaskList'

function setup(over: Partial<TaskListProps> = {}) {
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
  render(<TaskList {...props} />)
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

  it('ничего не найдено при поиске', () => {
    setup({ items: [], searching: true })
    expect(screen.getByText('Ничего не найдено')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Создать задачу' })).toBeNull()
  })

  it('ошибка с «Повторить»', async () => {
    const props = setup({ items: [], error: 'Нет сети' })
    expect(screen.getByRole('alert').textContent).toContain('Нет сети')
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(props.onRetry).toHaveBeenCalled()
  })

  it('«Показать ещё» с остатком', async () => {
    const props = setup({ hasMore: true, remaining: 7 })
    await userEvent.click(screen.getByRole('button', { name: /Показать ещё/ }))
    expect(props.onLoadMore).toHaveBeenCalled()
    expect(screen.getByText(/7/)).toBeTruthy()
  })
})
