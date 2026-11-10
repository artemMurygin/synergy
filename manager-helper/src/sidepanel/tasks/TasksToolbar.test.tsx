import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TasksView } from '@/shared/tasks-view'
import { TasksToolbar } from './TasksToolbar'

function setup(view: TasksView = 'mine', search = '') {
  const onViewChange = vi.fn()
  const onSearchChange = vi.fn()
  render(
    <TasksToolbar
      view={view}
      search={search}
      onViewChange={onViewChange}
      onSearchChange={onSearchChange}
    />,
  )
  return { onViewChange, onSearchChange }
}

describe('TasksToolbar', () => {
  it('lists the four views and marks the current one', () => {
    setup('created')
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Мои',
      'Наблюдаю',
      'Созданные мной',
      'Готовые',
    ])
    expect(screen.getByRole('tab', { name: 'Созданные мной' }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Мои' }).getAttribute('aria-selected')).toBe('false')
  })

  it('reports a chosen view but not a click on the current one', () => {
    const { onViewChange } = setup('mine')
    fireEvent.click(screen.getByRole('tab', { name: 'Мои' }))
    expect(onViewChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'Готовые' }))
    expect(onViewChange).toHaveBeenCalledWith('done')
  })

  it('shows the search text and reports typing', () => {
    const { onSearchChange } = setup('mine', 'отчёт')
    const input = screen.getByRole('searchbox', { name: 'Поиск по названию' })
    expect(input).toHaveProperty('value', 'отчёт')
    fireEvent.change(input, { target: { value: 'кп' } })
    expect(onSearchChange).toHaveBeenCalledWith('кп')
  })
})
