import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { adminEmployeeFixture, dismissedEmployeeFixture, employeeFixture } from '@/features/employees/model/employees.fixtures'
import { departmentFixture, departmentWithoutHead } from '@/features/departments/model/fixtures'
import { createTestClient, json, page, queryWrapper, stubFetch, type FetchCall } from '@/test/helpers'
import { EmployeesPage } from './EmployeesPage'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'e2', login: 'akotova', mustChangePassword: false, roles: ['admin'], fullName: 'Котова Анна Сергеевна', lastName: 'Котова', firstName: 'Анна', middleName: 'Сергеевна', position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

function renderPage(entry = '/admin/employees') {
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <MemoryRouter initialEntries={[entry]}>
        <Where />
        <Routes>
          <Route path="/admin/employees" element={<EmployeesPage />} />
          <Route path="/admin/employees/new" element={<p>create-page</p>} />
          <Route path="/admin/employees/:id" element={<p>card-page</p>} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

const everyone = [employeeFixture, adminEmployeeFixture, dismissedEmployeeFixture]

function api(list: (c: FetchCall) => Response = () => json(page(everyone)), departments: () => Response = () => json([departmentFixture, departmentWithoutHead])) {
  return stubFetch((c) => {
    if (c.path === '/admin/departments') return departments()
    if (c.path === '/admin/employees') return list(c)
    return json({}, 404)
  })
}

const listCalls = (calls: FetchCall[]) => calls.filter((c) => c.path === '/admin/employees')
const where = () => screen.getByTestId('where').textContent

describe('EmployeesPage', () => {
  it('shows the heading, the add action and the first page of employees', async () => {
    api()
    renderPage()
    expect(screen.getByRole('heading', { name: 'Сотрудники' })).toBeTruthy()
    expect(screen.getByText('Люди портала, их отделы и доступы')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Добавить сотрудника' }).getAttribute('href')).toBe('/admin/employees/new')
    expect(await screen.findByRole('link', { name: 'Иванов Иван Петрович' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Котова Анна Сергеевна' })).toBeTruthy()
    expect(screen.getByText('Уволен')).toBeTruthy()
  })

  it('shows the loading state with a status and no table yet', () => {
    api(() => new Promise<Response>(() => undefined) as unknown as Response)
    renderPage()
    expect(within(screen.getByRole('status')).getByText('Загружаем сотрудников…')).toBeTruthy()
    expect(screen.queryByRole('list', { name: /./ })).toBeNull()
  })

  it('shows the empty state with the add action when nothing is filtered', async () => {
    api(() => json(page([])))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Сотрудников пока нет' })).toBeTruthy()
    expect(screen.getByText('Добавьте первого сотрудника — он получит временный пароль для входа')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /Добавить сотрудника/ }).length).toBeGreaterThan(0)
  })

  it('shows "Сотрудники не найдены" and resets the filters from it', async () => {
    api(() => json(page([])))
    renderPage('/admin/employees?search=zzz')
    expect(await screen.findByRole('heading', { name: 'Сотрудники не найдены' })).toBeTruthy()
    expect(screen.getByText('Измените запрос или сбросьте фильтры')).toBeTruthy()
    await userEvent.click(screen.getAllByRole('button', { name: 'Сбросить фильтры' })[0] as HTMLElement)
    expect(where()).toBe('/admin/employees')
  })

  it('shows an error with a retry that loads the list again', async () => {
    let fail = true
    const { calls } = api(() => (fail ? json({ message: 'boom' }, 500) : json(page(everyone))))
    renderPage()
    expect(await screen.findByText('Не удалось загрузить сотрудников')).toBeTruthy()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('link', { name: 'Иванов Иван Петрович' })).toBeTruthy()
    expect(listCalls(calls).length).toBeGreaterThanOrEqual(2)
  })

  it('reads the filters and the page from the address', async () => {
    const { calls } = api()
    renderPage('/admin/employees?search=ivan&department=d-sales&status=dismissed&page=2')
    await screen.findByRole('link', { name: 'Иванов Иван Петрович' })
    const query = new URLSearchParams(listCalls(calls)[0]?.search)
    expect(query.get('search')).toBe('ivan')
    expect(query.get('departmentId')).toBe('d-sales')
    expect(query.get('isActive')).toBe('false')
    expect(query.get('page')).toBe('1')
  })

  it('writes the status filter to the address and goes back to the first page', async () => {
    api()
    renderPage('/admin/employees?page=3')
    await screen.findByRole('link', { name: 'Иванов Иван Петрович' })
    await userEvent.click(screen.getByRole('button', { name: 'Уволенные' }))
    expect(where()).toBe('/admin/employees?status=dismissed')
  })

  it('keeps the rows on the screen while the next page loads', async () => {
    let release: (() => void) | undefined
    let second = false
    api((c) => {
      if (new URLSearchParams(c.search).get('page') === '1') {
        second = true
        return new Promise<Response>((resolve) => {
          release = () => resolve(json(page([employeeFixture], 1)))
        }) as unknown as Response
      }
      return json({ items: everyone, total: 45, limit: 20, page: 0 })
    })
    renderPage()
    await screen.findByRole('link', { name: 'Иванов Иван Петрович' })
    await userEvent.click(screen.getByRole('button', { name: /Вперёд/ }))
    await vi.waitFor(() => expect(second).toBe(true))
    expect(screen.getByRole('link', { name: 'Иванов Иван Петрович' })).toBeTruthy()
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(screen.queryByText('Загружаем сотрудников…')).toBeNull()
    release?.()
    await vi.waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull())
    expect(where()).toBe('/admin/employees?page=2')
  })

  it('still shows the list when the departments for the filter failed to load', async () => {
    api(undefined, () => json({ message: 'boom' }, 500))
    renderPage()
    expect(await screen.findByRole('link', { name: 'Иванов Иван Петрович' })).toBeTruthy()
    expect(await screen.findByText('Отделы не загрузились')).toBeTruthy()
  })

  it('opens the card of the employee on click', async () => {
    api()
    renderPage()
    await userEvent.click(await screen.findByRole('link', { name: 'Иванов Иван Петрович' }))
    expect(screen.getByText('card-page')).toBeTruthy()
  })
})
