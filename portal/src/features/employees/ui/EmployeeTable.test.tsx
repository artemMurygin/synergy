import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import {
  adminEmployeeFixture,
  bareEmployeeFixture,
  dismissedEmployeeFixture,
  employeeFixture,
  plainEmployeeFixture
} from '../model/employees.fixtures'
import type { Employee } from '../model/employees.schema'
import { EmployeeTable } from './EmployeeTable'

afterEach(cleanup)

const all: Employee[] = [employeeFixture, adminEmployeeFixture, plainEmployeeFixture, dismissedEmployeeFixture, bareEmployeeFixture]

function setup(items: Employee[] = all, busy = false) {
  render(
    <MemoryRouter>
      <EmployeeTable items={items} busy={busy} />
    </MemoryRouter>
  )
}

const row = (fullName: string) => screen.getByRole('link', { name: fullName })

describe('EmployeeTable', () => {
  it('has the columns Сотрудник, Отдел, Должность, Роли, Статус in this order', () => {
    setup()
    const head = screen.getByTestId('employee-table-head').textContent ?? ''
    const positions = ['Сотрудник', 'Отдел', 'Должность', 'Роли', 'Статус'].map((label) => head.indexOf(label))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('shows the full name, the login, the department and the position of a row', () => {
    setup()
    const r = within(row('Иванов Иван Петрович'))
    expect(r.getByText('Иванов Иван Петрович')).toBeTruthy()
    expect(r.getByText('ivanov')).toBeTruthy()
    expect(r.getByText('Бухгалтерия')).toBeTruthy()
    expect(r.getByText('Бухгалтер')).toBeTruthy()
  })

  it('shows the roles as badges in Russian: Администратор, Разработчик', () => {
    setup()
    const r = within(row('Котова Анна Сергеевна'))
    expect(r.getByText('Администратор')).toBeTruthy()
    expect(r.getByText('Разработчик')).toBeTruthy()
    expect(r.queryByText('Сотрудник')).toBeNull()
  })

  it('shows the badge "Сотрудник" for a person without roles', () => {
    setup()
    expect(within(row('Кузнецова Ирина Павловна')).getByText('Сотрудник')).toBeTruthy()
  })

  it('never shows a role name in Latin', () => {
    setup()
    expect(screen.queryByText('admin')).toBeNull()
    expect(screen.queryByText('developer')).toBeNull()
  })

  it('shows the status "Активен" or "Уволен"', () => {
    setup()
    expect(within(row('Иванов Иван Петрович')).getByText('Активен')).toBeTruthy()
    expect(within(row('Лебедев Олег Викторович')).getByText('Уволен')).toBeTruthy()
    expect(within(row('Лебедев Олег Викторович')).queryByText('Активен')).toBeNull()
  })

  it('mutes the text of a dismissed employee and keeps the badge', () => {
    setup()
    const dismissed = within(row('Лебедев Олег Викторович'))
    expect(dismissed.getByText('Лебедев Олег Викторович').className).toContain('text-ink-60')
    expect(dismissed.getByText('Продажи').className).toContain('text-ink-60')
    const active = within(row('Иванов Иван Петрович'))
    expect(active.getByText('Иванов Иван Петрович').className).not.toContain('text-ink-60')
  })

  it('shows "—" for an empty department and position', () => {
    setup()
    expect(within(row('Никитин Павел')).getAllByText('—')).toHaveLength(2)
  })

  it('makes the whole row a link to the card', () => {
    setup()
    expect(row('Иванов Иван Петрович').getAttribute('href')).toBe('/admin/employees/e1')
    expect(row('Лебедев Олег Викторович').getAttribute('href')).toBe('/admin/employees/e4')
  })

  it('is a list of cards that turns into a grid only from md, not a table', () => {
    setup()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(all.length)
    const className = row('Иванов Иван Петрович').className
    expect(className).toContain('flex-col')
    expect(className).toContain('md:grid')
  })

  it('marks the list as busy while it reloads and keeps the old rows', () => {
    setup(all, true)
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBe('true')
    expect(screen.getAllByRole('listitem')).toHaveLength(all.length)
  })

  it('is not busy by default', () => {
    setup()
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBeNull()
  })
})
