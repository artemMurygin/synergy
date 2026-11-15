import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { departmentDismissedHead, departmentFixture, departmentWithoutHead, emptyDepartment } from '@/features/departments/model/fixtures'
import type { Department } from '@/features/departments'
import { createTestClient, json, queryWrapper, stubFetch, type FetchCall } from '@/test/helpers'
import { DepartmentsPage } from './DepartmentsPage'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'e2', login: 'akotova', mustChangePassword: false, roles: ['admin'], fullName: 'Котова Анна Сергеевна', lastName: 'Котова', firstName: 'Анна', middleName: 'Сергеевна', position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage() {
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <MemoryRouter initialEntries={['/admin/departments']}>
        <DepartmentsPage />
      </MemoryRouter>
    </Wrapper>
  )
}

function server(initial: Department[], write: (c: FetchCall, state: { items: Department[] }) => Response | undefined = () => undefined) {
  const state = { items: initial }
  return stubFetch((c) => {
    const custom = write(c, state)
    if (custom) return custom
    if (c.path === '/admin/departments' && c.method === 'GET') return json(state.items)
    if (c.path === '/admin/employees') return json({ items: [], total: 0, limit: 10, page: 0 })
    return json({}, 404)
  })
}

const all = [departmentFixture, departmentWithoutHead, departmentDismissedHead, emptyDepartment]

describe('DepartmentsPage', () => {
  it('shows the heading, the caption and the departments with heads and counts', async () => {
    server(all)
    renderPage()
    expect(screen.getByRole('heading', { name: 'Отделы' })).toBeTruthy()
    expect(screen.getByText('Справочник отделов. Отдел и руководитель не влияют на доступы')).toBeTruthy()
    expect(await screen.findByText('Продажи')).toBeTruthy()
    expect(screen.getByText('Петрова Мария Сергеевна')).toBeTruthy()
    expect(screen.getAllByText('Не назначен').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Создать отдел' })).toBeTruthy()
  })

  it('shows the loading state', () => {
    stubFetch(() => new Promise<Response>(() => undefined) as unknown as Response)
    renderPage()
    expect(within(screen.getByRole('status')).getByText('Загружаем отделы…')).toBeTruthy()
  })

  it('shows the empty state with the create action', async () => {
    server([])
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Отделов пока нет' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Создать отдел' })).toHaveLength(1)
  })

  it('shows an error with a retry', async () => {
    let fail = true
    stubFetch(() => (fail ? json({ message: 'boom' }, 500) : json(all)))
    renderPage()
    expect(await screen.findByText('Не удалось загрузить отделы')).toBeTruthy()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByText('Продажи')).toBeTruthy()
  })

  it('creates a department and shows it in the list with a success notice', async () => {
    const { calls } = server(all, (c, state) => {
      if (c.method === 'POST' && c.path === '/admin/departments') {
        const created = { id: 'd-new', name: 'Закупки', head: null, employeeCount: 0 }
        state.items = [...state.items, created]
        return json(created, 201)
      }
      return undefined
    })
    renderPage()
    await screen.findByText('Продажи')
    await userEvent.click(screen.getByRole('button', { name: 'Создать отдел' }))
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText(/^Название/), 'Закупки')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Создать' }))
    expect(await screen.findByText('Отдел создан')).toBeTruthy()
    expect(await screen.findByText('Закупки')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'Закупки' })
  })

  it('does not close the dialog on Escape while saving, and still shows the success notice', async () => {
    let release: (r: Response) => void = () => undefined
    const slow = new Promise<Response>((resolve) => (release = resolve))
    server(all, (c) => (c.method === 'POST' ? (slow as unknown as Response) : undefined))
    renderPage()
    await screen.findByText('Продажи')
    await userEvent.click(screen.getByRole('button', { name: 'Создать отдел' }))
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText(/^Название/), 'Закупки')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Создать' }))
    await screen.findByText('Создаём…')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeTruthy()
    release(json({ id: 'd-new', name: 'Закупки', head: null, employeeCount: 0 }, 201))
    expect(await screen.findByText('Отдел создан')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the taken name at the field and keeps the dialog open', async () => {
    server(all, (c) => (c.method === 'POST' ? json({ message: 'taken', code: 'DEPARTMENT_NAME_TAKEN' }, 409) : undefined))
    renderPage()
    await screen.findByText('Продажи')
    await userEvent.click(screen.getByRole('button', { name: 'Создать отдел' }))
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText(/^Название/), 'Продажи')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Создать' }))
    expect(await screen.findByText('Отдел с таким названием уже есть')).toBeTruthy()
    expect((within(screen.getByRole('dialog')).getByLabelText(/^Название/) as HTMLInputElement).value).toBe('Продажи')
  })

  it('renames a department from its edit button', async () => {
    const { calls } = server(all, (c, state) => {
      if (c.method === 'PATCH') {
        state.items = state.items.map((d) => (d.id === 'd-law' ? { ...d, name: 'Юристы' } : d))
        return json(state.items.find((d) => d.id === 'd-law'))
      }
      return undefined
    })
    renderPage()
    await screen.findByText('Юридический отдел')
    await userEvent.click(screen.getByRole('button', { name: 'Изменить отдел Юридический отдел' }))
    const name = within(screen.getByRole('dialog')).getByLabelText(/^Название/)
    await userEvent.clear(name)
    await userEvent.type(name, 'Юристы')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Изменения сохранены')).toBeTruthy()
    expect(await screen.findByText('Юристы')).toBeTruthy()
    expect(calls.find((c) => c.method === 'PATCH')?.path).toBe('/admin/departments/d-law')
  })

  it('deletes an empty department after the confirmation and moves the focus to "Создать отдел"', async () => {
    server(all, (c, state) => {
      if (c.method === 'DELETE') {
        state.items = state.items.filter((d) => d.id !== 'd-law')
        return new Response(null, { status: 204 })
      }
      return undefined
    })
    renderPage()
    await screen.findByText('Юридический отдел')
    await userEvent.click(screen.getByRole('button', { name: 'Удалить отдел Юридический отдел' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Удалить' }))
    expect(await screen.findByText('Отдел удалён')).toBeTruthy()
    await vi.waitFor(() => expect(screen.queryByText('Юридический отдел')).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Создать отдел' })))
  })

  it('cancelling the deletion changes nothing', async () => {
    const { calls } = server(all)
    renderPage()
    await screen.findByText('Продажи')
    await userEvent.click(screen.getByRole('button', { name: 'Удалить отдел Продажи' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Отмена' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    expect(screen.getByText('Продажи')).toBeTruthy()
  })

  it('says the department is not empty on 409 and keeps the row', async () => {
    server(all, (c) => (c.method === 'DELETE' ? json({ message: 'not empty', code: 'DEPARTMENT_NOT_EMPTY' }, 409) : undefined))
    renderPage()
    await screen.findByText('Продажи')
    await userEvent.click(screen.getByRole('button', { name: 'Удалить отдел Продажи' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Удалить' }))
    expect(await screen.findByText(/Отдел «Продажи» не пуст/)).toBeTruthy()
    expect(screen.getByText('Продажи')).toBeTruthy()
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Удалить отдел Продажи' })))
  })
})
