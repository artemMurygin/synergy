import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { json, queryWrapper, skillFixture, stubFetch } from '@/test/helpers'
import { SkillsTable } from './SkillsTable'

beforeEach(() => {
  stubFetch(() => json([agent]))
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'], fullName: 'dev', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const agent = { id: 'a1', name: 'Ассистент', product: { id: 'p1', name: 'Manager Helper' } }
const items = [
  { ...skillFixture, id: 's1', name: 'Сводка встречи', requestsCount: 2 },
  { ...skillFixture, id: 's2', name: 'Сверка актов', status: 'in_dev' as const, requestsCount: 0 }
]

function renderTable(props: Partial<React.ComponentProps<typeof SkillsTable>> = {}) {
  const Wrapper = queryWrapper()
  const onFilterChange = vi.fn()
  const ui = (extra: Partial<React.ComponentProps<typeof SkillsTable>>) => (
    <Wrapper>
      <SkillsTable items={items} filter={undefined} onFilterChange={onFilterChange} {...props} {...extra} />
    </Wrapper>
  )
  const view = render(ui({}))
  return Object.assign(onFilterChange, { rerender: (extra: Partial<React.ComponentProps<typeof SkillsTable>>) => view.rerender(ui(extra)) })
}

describe('SkillsTable', () => {
  it('has the columns skill, agent and product, status, requests count and changed date', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Навык', 'Агент · продукт', 'Статус', 'Заявок', 'Изменён', 'Действие'])
  })

  it('shows the date of the last status change', () => {
    renderTable()
    const row = screen.getByText('Сводка встречи').closest('tr') as HTMLElement
    expect(within(row).getByText('02.11.2026')).toBeTruthy()
  })

  it('shows a row per skill with agent, product and count', async () => {
    renderTable()
    await screen.findAllByText('Manager Helper')
    const row = screen.getByText('Сводка встречи').closest('tr') as HTMLElement
    expect(within(row).getByText('Ассистент')).toBeTruthy()
    expect(within(row).getByText('Manager Helper')).toBeTruthy()
    expect(within(row).getByText('2')).toBeTruthy()
    expect(within(row).getByText('Запланировано')).toBeTruthy()
  })

  it('calls onFilterChange with the chosen status chip and undefined for all', async () => {
    const onFilterChange = renderTable({ filter: 'in_dev', counts: { total: 40, byStatus: { planned: 3, in_dev: 2, testing: 1, launched: 34 } } })
    const user = userEvent.setup()
    const group = screen.getByRole('group', { name: 'Статус навыка' })
    expect(within(group).getByRole('button', { name: 'В разработке · 2' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(within(group).getByRole('button', { name: 'Тестируется · 1' }))
    expect(onFilterChange).toHaveBeenLastCalledWith('testing')
    await user.click(within(group).getByRole('button', { name: 'Все · 40' }))
    expect(onFilterChange).toHaveBeenLastCalledWith(undefined)
  })

  it('filters by search text and by product on the client', async () => {
    const view = renderTable({ search: 'сверка' })
    await screen.findAllByText('Manager Helper')
    expect(screen.getByText('Сверка актов')).toBeTruthy()
    expect(screen.queryByText('Сводка встречи')).toBeNull()
    view.rerender({ search: 'ассистент', product: 'other' })
    expect(await screen.findByText('Ничего не нашлось')).toBeTruthy()
  })

  it('shows the empty result with the filter in the text and a reset', async () => {
    const onReset = vi.fn()
    renderTable({ items: [], filter: 'in_dev', search: 'отчёт', onReset })
    expect(screen.getByText('Ничего не нашлось')).toBeTruthy()
    expect(screen.getByText('Нет навыков в статусе «В разработке» по запросу «отчёт».')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    expect(onReset).toHaveBeenCalled()
  })

  it('shows a notice with the conflict and highlights nothing else', async () => {
    stubFetch((c) => (c.method === 'POST' ? json({ message: 'x' }, 409) : json([agent])))
    renderTable()
    const row = screen.getByText('Сводка встречи').closest('tr') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: 'В разработку' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Статус уже изменили/)
    expect(alert.textContent).toMatch(/Статус навыка уже изменён/)
    await userEvent.click(within(alert).getByRole('button', { name: 'Понятно' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
