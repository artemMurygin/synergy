import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { departmentDismissedHead, departmentFixture, departmentWithoutHead, emptyDepartment } from '../model/fixtures'
import { DepartmentTable } from './DepartmentTable'

afterEach(cleanup)

function setup(items = [departmentFixture, departmentWithoutHead, departmentDismissedHead, emptyDepartment]) {
  const onCreate = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(<DepartmentTable items={items} onCreate={onCreate} onEdit={onEdit} onDelete={onDelete} />)
  return { onCreate, onEdit, onDelete }
}

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) })

describe('DepartmentTable', () => {
  it('has the columns Отдел, Руководитель, Сотрудников', () => {
    setup()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(expect.arrayContaining(['Отдел', 'Руководитель', 'Сотрудников']))
  })

  it('shows the name, the head full name and the employee count of a row', () => {
    setup()
    const r = within(row('Продажи'))
    expect(r.getByText('Продажи')).toBeTruthy()
    expect(r.getByText('Петрова Мария Сергеевна')).toBeTruthy()
    expect(r.getByText('12')).toBeTruthy()
    expect(r.queryByText('Уволен')).toBeNull()
  })

  it('shows "Не назначен" for a department without a head', () => {
    setup()
    expect(within(row('Разработка')).getByText('Не назначен')).toBeTruthy()
  })

  it('marks a dismissed head with the badge "Уволен" and a muted name', () => {
    setup()
    const r = within(row('Маркетинг'))
    expect(r.getByText('Павлов Артём Игоревич').className).toContain('text-ink-60')
    expect(r.getByText('Уволен')).toBeTruthy()
  })

  it('shows zero employees', () => {
    setup()
    expect(within(row('Юридический отдел')).getByText('0')).toBeTruthy()
  })

  it('has icon buttons named after the department and reports the department', async () => {
    const { onEdit, onDelete } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Изменить отдел Продажи' }))
    expect(onEdit).toHaveBeenCalledWith(departmentFixture)
    await userEvent.click(screen.getByRole('button', { name: 'Удалить отдел Маркетинг' }))
    expect(onDelete).toHaveBeenCalledWith(departmentDismissedHead)
    expect(screen.getByRole('button', { name: 'Удалить отдел Маркетинг' }).getAttribute('title')).toBe('Удалить отдел Маркетинг')
  })

  it('shows the empty state with "Создать отдел"', async () => {
    const { onCreate } = setup([])
    expect(screen.getByText('Отделов пока нет')).toBeTruthy()
    expect(screen.getByText('Создайте отдел, чтобы указывать его в карточках сотрудников')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Создать отдел' }))
    expect(onCreate).toHaveBeenCalledOnce()
  })

  it('at 360 reserves 104px on the right of the card for the buttons and keeps 13px text', () => {
    setup()
    const r = row('Продажи')
    expect(r.className).toContain('pr-[104px]')
    const head = within(r).getByText('Петрова Мария Сергеевна').closest('td')!
    expect(head.className).toContain('text-[13px]')
    expect(within(r).getByText('Продажи').className).not.toContain('pr-24')
  })

  it('at 360 colours the head line ink-80', () => {
    setup()
    const cell = within(row('Продажи')).getByText('Петрова Мария Сергеевна').closest('td')!
    expect(cell.className).toContain('text-ink-80')
  })

  it('at 360 colours the line of a dismissed head ink-60', () => {
    setup()
    const cell = within(row('Маркетинг')).getByText('Павлов Артём Игоревич').closest('td')!
    expect(cell.className).toContain('text-ink-60')
    expect(cell.className).not.toContain('text-ink-80')
  })

  it('colours a head line without a head ink-40', () => {
    setup()
    const cell = within(row('Разработка')).getByText('Не назначен').closest('td')!
    expect(cell.className).toContain('text-ink-40')
  })
})
