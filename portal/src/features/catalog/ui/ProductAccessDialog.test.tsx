import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { CATALOG_KEY, DEPARTMENTS_KEY } from '@/lib/query-keys'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { ProductAccessDialog } from './ProductAccessDialog'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'admin', mustChangePassword: false, roles: ['admin'], fullName: 'admin', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const departments = [
  { id: 'd3', name: 'Юридический отдел' },
  { id: 'd1', name: 'КЦ 1' },
  { id: 'd2', name: 'КЦ 2' }
]
const product = { id: 'p-mh', name: 'Manager Helper', departments: [{ id: 'd2', name: 'КЦ 2' }] }
const answer = { id: 'p-mh', slug: 'manager-helper', name: 'Manager Helper', departments: [] }

function renderDialog(opts: { departments?: typeof departments; onClose?: () => void } = {}) {
  const client = createTestClient()
  const spy = vi.spyOn(client, 'invalidateQueries')
  const onClose = opts.onClose ?? vi.fn()
  const Wrapper = queryWrapper(client)
  render(
    <Wrapper>
      <MemoryRouter>
        <ProductAccessDialog product={product} departments={opts.departments ?? departments} open onClose={onClose} />
      </MemoryRouter>
    </Wrapper>
  )
  return { spy, onClose }
}

const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement

describe('ProductAccessDialog', () => {
  it('lists departments by name with the assigned ones checked and the counter', () => {
    renderDialog()
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-labelledby') && document.getElementById(c.getAttribute('aria-labelledby')!)?.textContent)).toEqual(['КЦ 1', 'КЦ 2', 'Юридический отдел'])
    expect(box('КЦ 2').checked).toBe(true)
    expect(box('КЦ 1').checked).toBe(false)
    expect(screen.getByText('Выбран 1 отдел из 3')).toBeTruthy()
  })

  it('updates the counter and saves the whole set', async () => {
    const { calls } = stubFetch(() => json(answer))
    const { spy, onClose } = renderDialog()
    await userEvent.click(box('КЦ 1'))
    expect(screen.getByText('Выбрано 2 из 3')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calls[0]).toMatchObject({ method: 'PUT', path: '/portal/products/p-mh/departments' })
    expect((calls[0]?.body as { departmentIds: string[] }).departmentIds.sort()).toEqual(['d1', 'd2'])
    expect(spy).toHaveBeenCalledWith({ queryKey: CATALOG_KEY })
  })

  it('saves an empty set when every mark is cleared', async () => {
    const { calls } = stubFetch(() => json(answer))
    renderDialog()
    await userEvent.click(box('КЦ 2'))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]?.body).toEqual({ departmentIds: [] })
  })

  it('locks the actions while saving', async () => {
    stubFetch(() => new Promise<Response>(() => undefined))
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    const saving = await screen.findByRole('button', { name: 'Сохраняем…' })
    expect((saving as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Отмена' }) as HTMLButtonElement).disabled).toBe(true)
    expect(box('КЦ 1').disabled).toBe(true)
  })

  it('keeps the dialog open with the marks and the message on an error', async () => {
    stubFetch(() => json({ message: 'Сервер недоступен' }, 500))
    const { onClose } = renderDialog()
    await userEvent.click(box('КЦ 1'))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    expect(box('КЦ 1').checked).toBe(true)
    expect(box('КЦ 2').checked).toBe(true)
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('on 404 shows that the department is gone and reloads the departments', async () => {
    stubFetch(() => json({ code: 'PORTAL_DEPARTMENT_NOT_FOUND', message: 'нет' }, 404))
    const { spy, onClose } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Отдел уже удалён')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    expect(spy).toHaveBeenCalledWith({ queryKey: DEPARTMENTS_KEY })
  })

  it('shows a hint, a link to "Отделы" and a single "Закрыть" for an empty directory', async () => {
    const { onClose } = renderDialog({ departments: [] })
    expect(screen.getByText('В справочнике нет отделов')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Перейти в «Отделы»/ }).getAttribute('href')).toBe('/admin/departments')
    expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Отмена' })).toBeNull()
    await userEvent.click(screen.getAllByRole('button', { name: 'Закрыть' }).at(-1)!)
    expect(onClose).toHaveBeenCalled()
  })
})
