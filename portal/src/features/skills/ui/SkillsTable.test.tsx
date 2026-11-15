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

const agent = {
  id: 'a1',
  name: 'Ассистент',
  products: [
    { id: 'p1', slug: 'control-center', name: 'Control Center' },
    { id: 'p2', slug: 'telegram', name: 'Telegram-бот' }
  ]
}
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
    await screen.findAllByText('Control Center, Telegram-бот')
    const row = screen.getByText('Сводка встречи').closest('tr') as HTMLElement
    expect(within(row).getByText('Ассистент')).toBeTruthy()
    expect(within(row).getByText('Control Center, Telegram-бот')).toBeTruthy()
    expect(within(row).getByText('2')).toBeTruthy()
    expect(within(row).getByText('Запланировано')).toBeTruthy()
  })

  it('calls onFilterChange with the chosen status chip and undefined for all', async () => {
    const onFilterChange = renderTable({ filter: 'in_dev', counts: { total: 40, byStatus: { planned: 3, in_dev: 2, testing: 1, launched: 34, rework: 1 } } })
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
    await screen.findAllByText('Control Center, Telegram-бот')
    expect(screen.getByText('Сверка актов')).toBeTruthy()
    expect(screen.queryByText('Сводка встречи')).toBeNull()
    view.rerender({ search: 'ассистент', product: 'p2' })
    expect((await screen.findAllByText('Сверка актов')).length).toBeGreaterThan(0)
    view.rerender({ search: 'ассистент', product: 'other' })
    expect(await screen.findByText('Ничего не нашлось')).toBeTruthy()
  })

  it('keeps a skill whose agent has the chosen product among several', async () => {
    renderTable({ product: 'p1' })
    expect(await screen.findByText('Сводка встречи')).toBeTruthy()
    expect(screen.getByText('Сверка актов')).toBeTruthy()
  })

  it('has chips in the order of the design with "Доработка" between "Тестируется" and "Запущено"', () => {
    renderTable({ counts: { total: 5, byStatus: { planned: 1, in_dev: 1, testing: 1, launched: 1, rework: 1 } } })
    const group = screen.getByRole('group', { name: 'Статус навыка' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Все · 5', 'Запланировано · 1', 'В разработке · 1', 'Тестируется · 1', 'Доработка · 1', 'Запущено · 1'
    ])
  })

  it('shows the "Доработка" summary tile', () => {
    renderTable({ counts: { total: 5, byStatus: { planned: 1, in_dev: 1, testing: 1, launched: 1, rework: 1 } } })
    const tiles = within(screen.getByRole('list', { name: 'Сводка по статусам' }))
    expect(tiles.getByText('Доработка')).toBeTruthy()
    expect(tiles.getByText('вернули после проверки')).toBeTruthy()
  })

  it('puts an archive icon button into every row', () => {
    renderTable()
    const row = screen.getByText('Сводка встречи').closest('tr') as HTMLElement
    expect(within(row).getByRole('button', { name: 'Архивировать навык «Сводка встречи»' })).toBeTruthy()
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
