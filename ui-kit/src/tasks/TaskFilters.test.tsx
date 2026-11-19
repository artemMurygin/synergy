import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LayoutModeProvider, type LayoutMode } from '../layout/layout-mode'
import { TaskFilters, type TaskFiltersProps } from './TaskFilters'

function setup(mode: LayoutMode, over: Partial<TaskFiltersProps> = {}) {
  const props: TaskFiltersProps = {
    view: 'mine',
    onViewChange: vi.fn(),
    status: 'all',
    onStatusChange: vi.fn(),
    sort: 'deadline',
    onSortChange: vi.fn(),
    overdueCount: 3,
    search: '',
    onSearch: vi.fn(),
    ...over,
  }
  render(
    <LayoutModeProvider mode={mode}>
      <TaskFilters {...props} />
    </LayoutModeProvider>,
  )
  return props
}

const names = () =>
  within(screen.getByRole('group', { name: 'Представление' }))
    .getAllByRole('button')
    .map((b) => b.textContent)

afterEach(() => {
  vi.useRealTimers()
})

describe('TaskFilters', () => {
  it('desktop: все пять представлений', () => {
    setup('desktop')
    expect(names()).toEqual(['Все', 'Мои', 'Я наблюдаю', 'Созданные мной', 'Просрочено3'])
  })

  it('tablet: «Все», «Мои», «Ещё»', () => {
    setup('tablet')
    expect(names()).toEqual(['Все', 'Мои', 'Ещё'])
  })

  it('mobile: «Все», «Мои», «Просрочено» со счётчиком, «Ещё»', () => {
    setup('mobile')
    expect(names()).toEqual(['Все', 'Мои', 'Просрочено3', 'Ещё'])
  })

  it('выбранный сегмент помечен aria-pressed', () => {
    setup('tablet')
    expect(screen.getByRole('button', { name: 'Мои' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Все' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('tablet: меню «Ещё» содержит три представления, выбор вызывает onViewChange', async () => {
    const props = setup('tablet')
    await userEvent.click(screen.getByRole('button', { name: 'Ещё' }))
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent)
    expect(items).toEqual(['Я наблюдаю', 'Созданные мной', 'Просрочено3'])
    await userEvent.click(screen.getByRole('menuitem', { name: 'Я наблюдаю' }))
    expect(props.onViewChange).toHaveBeenCalledWith('watching')
  })

  it('mobile: в меню «Ещё» только «Я наблюдаю» и «Созданные мной»', async () => {
    setup('mobile')
    await userEvent.click(screen.getByRole('button', { name: 'Ещё' }))
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent)
    expect(items).toEqual(['Я наблюдаю', 'Созданные мной'])
  })

  it('представление из меню: «Ещё» показан выбранным', () => {
    setup('tablet', { view: 'watching' })
    expect(screen.getByRole('button', { name: 'Ещё' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Мои' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('клик по сегменту меняет представление', async () => {
    const props = setup('mobile')
    await userEvent.click(screen.getByRole('button', { name: /Просрочено/ }))
    expect(props.onViewChange).toHaveBeenCalledWith('overdue')
  })

  it('tablet и mobile: статус и сортировка на второй строке', () => {
    setup('tablet')
    const row = screen.getByTestId('filters-secondary-row')
    expect(within(row).getByRole('button', { name: /Статус/ })).toBeTruthy()
    expect(within(row).getByRole('button', { name: /Сортировка/ })).toBeTruthy()
  })

  it('desktop: статус и сортировка в одной строке с представлениями', () => {
    setup('desktop')
    expect(screen.queryByTestId('filters-secondary-row')).toBeNull()
    expect(screen.getByRole('button', { name: /Статус/ })).toBeTruthy()
  })

  it('выбор статуса и сортировки', async () => {
    const props = setup('desktop')
    await userEvent.click(screen.getByRole('button', { name: /Статус/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Готово' }))
    expect(props.onStatusChange).toHaveBeenCalledWith('done')
    await userEvent.click(screen.getByRole('button', { name: /Сортировка/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Сначала обновлённые' }))
    expect(props.onSortChange).toHaveBeenCalledWith('updated')
  })

  it('поиск отправляется после паузы, а не на каждый символ', () => {
    vi.useFakeTimers()
    const props = setup('desktop')
    const input = screen.getByRole('searchbox', { name: 'Поиск по названию' })
    fireEvent.change(input, { target: { value: 'к' } })
    fireEvent.change(input, { target: { value: 'кп' } })
    expect(props.onSearch).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(props.onSearch).toHaveBeenCalledTimes(1)
    expect(props.onSearch).toHaveBeenCalledWith('кп')
  })
})
