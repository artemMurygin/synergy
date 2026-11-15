import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Department } from '@/features/departments'
import { DEFAULT_EMPLOYEE_FILTER } from '../model/employees.queries'
import { EmployeeFilters, EMPLOYEE_SEARCH_DELAY_MS, type EmployeeFiltersProps, type EmployeeFiltersValue } from './EmployeeFilters'

const departments: Department[] = [
  { id: 'd-sales', name: 'Продажи', head: null, employeeCount: 3 },
  { id: 'd-acc', name: 'Бухгалтерия', head: null, employeeCount: 2 },
  { id: 'd-adm', name: 'Администрация', head: null, employeeCount: 1 }
]

const empty: EmployeeFiltersValue = { search: '', departmentId: undefined, status: 'all' }

// Testing Library drains its async wrapper with a real setTimeout unless it detects `jest` fake timers
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  Reflect.set(globalThis, 'jest', { advanceTimersByTime: vi.advanceTimersByTime.bind(vi) })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(globalThis, 'jest')
})

function setup(props: Partial<EmployeeFiltersProps> = {}) {
  const onChange = vi.fn()
  const onReset = vi.fn()
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime, delay: null })
  const element = (extra: Partial<EmployeeFiltersProps> = {}) => (
    <EmployeeFilters value={empty} departments={departments} onChange={onChange} onReset={onReset} {...props} {...extra} />
  )
  const view = render(element())
  return { onChange, onReset, user, rerender: (extra: Partial<EmployeeFiltersProps>) => view.rerender(element(extra)) }
}

const search = () => screen.getByRole('searchbox', { name: 'Поиск по ФИО, логину или email' }) as HTMLInputElement

describe('EmployeeFilters', () => {
  it('has a search field with the accessible name and placeholder from the design', () => {
    setup()
    expect(search().placeholder).toBe('Поиск по ФИО, логину или email')
  })

  it('limits the search length to the API limit', () => {
    setup()
    expect(search().maxLength).toBe(100)
  })

  it('draws the chevron of the department select as a background image', () => {
    setup()
    expect((screen.getByLabelText('Отдел') as HTMLSelectElement).style.backgroundImage).toContain('svg')
  })

  it('waits 300 ms after typing before it reports the search', async () => {
    const { onChange, user } = setup()
    expect(EMPLOYEE_SEARCH_DELAY_MS).toBe(300)
    await user.type(search(), 'ива')
    act(() => vi.advanceTimersByTime(299))
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ search: 'ива', departmentId: undefined, status: 'all' })
  })

  it('sends only the last text when the user keeps typing', async () => {
    const { onChange, user } = setup()
    await user.type(search(), 'и')
    act(() => vi.advanceTimersByTime(200))
    await user.type(search(), 'в')
    act(() => vi.advanceTimersByTime(200))
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(100))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ search: 'ив' })
  })

  it('lists "Все отделы" first and the departments alphabetically', () => {
    setup()
    const select = screen.getByRole('combobox', { name: 'Отдел' })
    const labels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(labels).toEqual(['Все отделы', 'Администрация', 'Бухгалтерия', 'Продажи'])
  })

  it('reports the chosen department', async () => {
    const { onChange, user } = setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Отдел' }), 'Бухгалтерия')
    expect(onChange).toHaveBeenLastCalledWith({ search: '', departmentId: 'd-acc', status: 'all' })
  })

  it('reports "Все отделы" as no department', async () => {
    const { onChange, user } = setup({ value: { ...empty, departmentId: 'd-acc' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Отдел' }), 'Все отделы')
    expect(onChange).toHaveBeenLastCalledWith({ search: '', departmentId: undefined, status: 'all' })
  })

  it('shows the status chips Все, Активные, Уволенные as a group with aria-pressed', () => {
    setup({ value: { ...empty, status: 'active' } })
    const group = screen.getByRole('group', { name: 'Статус' })
    expect(group).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Все' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Активные' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Уволенные' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('reports the status of a chip', async () => {
    const { onChange, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Уволенные' }))
    expect(onChange).toHaveBeenCalledWith({ search: '', departmentId: undefined, status: 'dismissed' })
  })

  it('keeps the text typed so far when another filter changes', async () => {
    const { onChange, user } = setup()
    await user.type(search(), 'пет')
    await user.click(screen.getByRole('button', { name: 'Активные' }))
    expect(onChange).toHaveBeenCalledWith({ search: 'пет', departmentId: undefined, status: 'active' })
  })

  it('hides "Сбросить фильтры" while no filter is active', () => {
    setup({ value: DEFAULT_EMPLOYEE_FILTER })
    expect(screen.queryByRole('button', { name: 'Сбросить фильтры' })).toBeNull()
  })

  it.each([
    ['search', { ...empty, search: 'иван' }],
    ['department', { ...empty, departmentId: 'd-acc' }],
    ['status', { ...empty, status: 'dismissed' as const }]
  ])('shows "Сбросить фильтры" when the %s filter is active and calls onReset', async (_name, value) => {
    const { onReset, user } = setup({ value })
    await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('clears the text field when the search is reset from outside', () => {
    const { rerender } = setup({ value: { ...empty, search: 'иван' } })
    expect(search().value).toBe('иван')
    rerender({ value: empty })
    expect(search().value).toBe('')
  })

  it('does not overwrite the text typed after the last report', async () => {
    const { user, rerender } = setup()
    await user.type(search(), 'и')
    act(() => vi.advanceTimersByTime(300))
    await user.type(search(), 'в')
    rerender({ value: { ...empty, search: 'и' } })
    expect(search().value).toBe('ив')
  })

  it('disables the department filter with a hint when the departments did not load', () => {
    setup({ departments: undefined, departmentsError: true })
    expect((screen.getByRole('combobox', { name: 'Отдел' }) as HTMLSelectElement).disabled).toBe(true)
    expect(screen.getByText('Отделы не загрузились')).toBeTruthy()
    fireEvent.change(search(), { target: { value: 'а' } })
    expect(search().value).toBe('а')
  })
})

describe('EmployeeFilters · 360 layout', () => {
  it('has no white card on narrow screens and a 14px search', () => {
    setup()
    const search = screen.getByRole('searchbox')
    const root = search.parentElement?.parentElement as HTMLElement
    expect(root.className).not.toMatch(/(^|\s)(border|bg-surface|p-4)(\s|$)/)
    expect(root.className).toContain('sm:border')
    expect(search.className).toContain('text-sm')
  })
})
